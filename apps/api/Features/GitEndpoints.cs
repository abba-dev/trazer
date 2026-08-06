using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

public static class GitEndpoints
{
    // Issue refs: "GAME-42" (or "fixes #GAME-42"). Match the project key so foreign refs are ignored.
    private static readonly Regex RefPattern = new(
        @"(?<![A-Z0-9])([A-Z][A-Z0-9]{1,9})-(\d+)(?![A-Z0-9])", RegexOptions.Compiled);

    // Close keywords: fixes/fixed/fix/closes/closed/close/resolves/resolved/resolve.
    private static readonly Regex ClosePattern = new(
        @"(?i)(?:fix(?:es|ed)?|clos(?:e|es|ed)?|resolv(?:e|es|ed)?)\s+(?:#?)([A-Z][A-Z0-9]{1,9})-(\d+)",
        RegexOptions.Compiled);

    public static void Map(WebApplication app)
    {
        // Inbound webhook. Unauthenticated — verified by signature/token against the project secret.
        // ponytail: single endpoint for both providers; the secret is per-project.
        app.MapPost("/api/git/webhook/{projectKey}", GitWebhookAsync);

        app.MapPut("/api/projects/{projectKey}/git-secret", SetGitSecretAsync)
            .RequireAuthorization();
    }

    private static async Task SetGitSecretAsync(string projectKey, UpdateGitSecretRequest req,
        TrazerDbContext db)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Key == projectKey.ToUpperInvariant())
            ?? throw ApiException.NotFound("Project not found");
        if (!string.IsNullOrWhiteSpace(req.Secret) && req.Secret.Length > 128)
            throw ApiException.BadRequest("Secret must be 128 chars max");
        project.GitSecret = string.IsNullOrWhiteSpace(req.Secret) ? null : req.Secret;
        await db.SaveChangesAsync();
    }

    private static async Task<IResult> GitWebhookAsync(string projectKey, HttpRequest request,
        TrazerDbContext db, WebhookService webhooks)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Key == projectKey.ToUpperInvariant())
            ?? throw ApiException.NotFound("Project not found");

        // GitHub signs the raw body with HMAC-SHA256; GitLab sends a plain token header.
        byte[] body;
        using (var ms = new MemoryStream())
        {
            await request.Body.CopyToAsync(ms);
            body = ms.ToArray();
        }

        var isGithub = request.Headers.ContainsKey("X-GitHub-Event");
        var isGitlab = request.Headers.ContainsKey("X-Gitlab-Event") || request.Headers.ContainsKey("X-Gitlab-Token");
        if (!isGithub && !isGitlab)
            return Results.Unauthorized();

        if (string.IsNullOrEmpty(project.GitSecret))
            return Results.Unauthorized(); // integration not configured on this project

        var valid = isGithub
            ? VerifyGithub(request, body, project.GitSecret)
            : VerifyGitlab(request, project.GitSecret);
        if (!valid)
            return Results.Unauthorized();

        await ProcessAsync(db, webhooks, project, isGithub, body);
        return Results.NoContent();
    }

    private static bool VerifyGithub(HttpRequest request, byte[] body, string secret)
    {
        var header = request.Headers["X-Hub-Signature-256"].ToString();
        if (!header.StartsWith("sha256=")) return false;
        var expected = header.Length > 7 ? header[7..] : string.Empty;
        var actual = Convert.ToHexString(WebhookService.HmacSha256(secret, body)).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(actual), Encoding.ASCII.GetBytes(expected));
    }

    private static bool VerifyGitlab(HttpRequest request, string secret)
    {
        var token = request.Headers["X-Gitlab-Token"].ToString();
        if (string.IsNullOrEmpty(token)) return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(secret));
    }

    private static async Task ProcessAsync(TrazerDbContext db, WebhookService webhooks,
        Project project, bool isGithub, byte[] body)
    {
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        var key = project.Key;

        if (isGithub && root.TryGetProperty("pull_request", out _))
        {
            await HandlePullRequestAsync(db, webhooks, project, key,
                title: root.GetProperty("pull_request").GetString("title") ?? "",
                bodyText: root.GetProperty("pull_request").GetString("body") ?? "",
                url: root.GetProperty("pull_request").GetString("html_url") ?? "",
                state: root.GetProperty("pull_request").GetString("state") ?? "",
                merged: root.GetProperty("pull_request").TryGetProperty("merged", out var m) && m.ValueKind == JsonValueKind.True);
            return;
        }

        if (!isGithub && root.TryGetProperty("object_kind", out var kind) &&
            kind.GetString() == "merge_request" && root.TryGetProperty("object_attributes", out var mr))
        {
            await HandlePullRequestAsync(db, webhooks, project, key,
                title: mr.GetString("title") ?? "",
                bodyText: mr.GetString("description") ?? "",
                url: mr.GetString("url") ?? "",
                state: mr.GetString("state") ?? "",
                merged: (mr.GetString("state") ?? "") is "merged" or "closed" && (mr.GetString("action") ?? "") is "merge" or "merge_request");
            return;
        }

        // Push event: scan commit messages for close keywords.
        var closeRefs = new List<(string Key, int Number)>();
        if (root.TryGetProperty("commits", out var commits) && commits.ValueKind == JsonValueKind.Array)
        {
            foreach (var c in commits.EnumerateArray())
            {
                var message = c.GetString("message") ?? "";
                foreach (Match m in ClosePattern.Matches(message))
                {
                    var refKey = m.Groups[1].Value.ToUpperInvariant();
                    if (refKey == key && int.TryParse(m.Groups[2].Value, out var n))
                        closeRefs.Add((refKey, n));
                }
            }
        }

        var touched = new List<Issue>();
        foreach (var (_, number) in closeRefs.Distinct())
        {
            var issue = await db.Issues
                .Include(i => i.Reporter)
                .FirstOrDefaultAsync(i => i.ProjectId == project.Id && i.Number == number);
            if (issue is null || issue.Status == IssueStatus.Done) continue;

            // ponytail: the project owner acts as the operator — no system user exists.
            // Ceiling: introduce a bot identity when attribution matters.
            TrackChange(db, issue, "status", issue.Status.ToString(), "Done", project.OwnerId);
            issue.Status = IssueStatus.Done;
            issue.UpdatedAt = DateTime.UtcNow;
            touched.Add(issue);
        }

        await db.SaveChangesAsync();
        foreach (var issue in touched)
            await webhooks.DispatchAsync(db, project.Id, "issue.updated", project.OwnerId, issue.ToDto());
    }

    private static async Task HandlePullRequestAsync(TrazerDbContext db, WebhookService webhooks,
        Project project, string key, string title, string bodyText, string url, string state, bool merged)
    {
        if (string.IsNullOrEmpty(url)) return;
        var stateLabel = merged ? "Merged" : state is "open" ? "Open" : "Closed";

        foreach (Match m in RefPattern.Matches($"{title}\n{bodyText}"))
        {
            if (m.Groups[1].Value.ToUpperInvariant() != key) continue;
            if (!int.TryParse(m.Groups[2].Value, out var number)) continue;

            var issue = await db.Issues.FirstOrDefaultAsync(i => i.ProjectId == project.Id && i.Number == number);
            if (issue is null) continue;

            var changed = issue.PullRequestUrl != url || issue.PullRequestState != stateLabel;
            issue.PullRequestUrl = url;
            issue.PullRequestState = stateLabel;
            issue.UpdatedAt = DateTime.UtcNow;
            if (changed)
                TrackChange(db, issue, "pull-request", null, url, project.OwnerId);
        }

        await db.SaveChangesAsync();
    }

    private static void TrackChange(TrazerDbContext db, Issue issue, string field, string? oldValue, string? newValue, Guid actorId)
    {
        if (oldValue == newValue) return;
        db.HistoryEntries.Add(new HistoryEntry
        {
            IssueId = issue.Id, ActorId = actorId, Field = field, OldValue = oldValue, NewValue = newValue
        });
    }
}

public record UpdateGitSecretRequest(string? Secret);

internal static class JsonExtensions
{
    public static string GetString(this JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String
            ? p.GetString() ?? ""
            : "";
}
