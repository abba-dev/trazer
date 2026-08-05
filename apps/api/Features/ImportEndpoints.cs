using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

// Import Jira JSON exports (Cloud and Server REST search shape) into a project.
// The strict schema wins: unknown statuses/types/priorities map to the closest Trazer
// equivalent, custom fields are dropped, and re-importing the same file updates
// issues (matched by SourceKey) instead of duplicating them.
//
// ponytail: single endpoint + pure mapper, no service layer. Only the fields Jira
// actually exports in a REST search are read: summary, description, issuetype.name,
// status.name, priority.name, created. Assignees/reporters are not mapped (the
// import runs as the current user), comments/attachments are not imported. Add them
// when the strict schema's UX demands it — not before.
public static class ImportEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/projects/{projectKey}/import").RequireAuthorization();

        group.MapPost("/jira", async (string projectKey, HttpRequest request, TrazerDbContext db, CurrentUserService current) =>
        {
            var project = await db.Projects.SingleOrDefaultAsync(p => p.Key == projectKey.ToUpperInvariant())
                ?? throw ApiException.NotFound("Project not found");

            using var json = await JsonDocument.ParseAsync(request.Body, new JsonDocumentOptions
            {
                AllowTrailingCommas = true,
                MaxDepth = 64
            });
            var root = json.RootElement;

            // Accept the raw REST search payload { "issues": [...] } — or a bare array.
            if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("issues", out var issuesProp))
                root = issuesProp;
            if (root.ValueKind != JsonValueKind.Array)
                throw ApiException.BadRequest("Expected a Jira search payload: { \"issues\": [...] } or an array of issues");

            var parsed = new List<JiraIssue>();
            foreach (var element in root.EnumerateArray())
                parsed.Add(JiraIssue.From(element));

            var actor = await db.Users.FindAsync(current.CurrentUserId)
                ?? throw ApiException.Unauthorized();

            var allocator = new IssueNumberAllocator(db, project.Id);

            var report = new List<object>();
            int created = 0, updated = 0, skipped = 0;

            foreach (var item in parsed)
            {
                if (string.IsNullOrWhiteSpace(item.Key) || string.IsNullOrWhiteSpace(item.Title))
                {
                    skipped++;
                    report.Add(new { key = item.Key ?? "(no key)", status = "skipped", why = "missing key or summary" });
                    continue;
                }

                var existing = await db.Issues
                    .Where(i => i.ProjectId == project.Id && i.SourceKey == item.Key)
                    .FirstOrDefaultAsync();

                if (existing is null)
                {
                    db.Issues.Add(new Issue
                    {
                        ProjectId = project.Id,
                        Number = await allocator.NextAsync(),
                        SourceKey = item.Key,
                        Title = Truncate(item.Title, 500),
                        Description = item.Description,
                        Type = item.Type,
                        Status = item.Status,
                        Priority = item.Priority,
                        ReporterId = actor.Id,
                        Position = 0,
                        CreatedAt = item.Created ?? DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                    created++;
                }
                else
                {
                    existing.Title = Truncate(item.Title, 500);
                    existing.Description = item.Description;
                    existing.Type = item.Type;
                    existing.Status = item.Status;
                    existing.Priority = item.Priority;
                    existing.UpdatedAt = DateTime.UtcNow;
                    updated++;
                }

                if (item.Mappings.Count > 0)
                    report.Add(new { key = item.Key, status = existing is null ? "created" : "updated", transformed = item.Mappings });

                await db.SaveChangesAsync();
            }

            return Results.Ok(new { created, updated, skipped, report });
        });
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}

// One normalized Jira issue with the strict-schema mappings applied up front so the
// endpoint stays a flat loop. Unknown enum strings fall back to the middle value and
// the mapping is recorded in Mappings for the report.
public sealed class JiraIssue
{
    public string? Key { get; private set; }
    public string? Title { get; private set; }
    public string? Description { get; private set; }
    public IssueType Type { get; private set; } = IssueType.Task;
    public IssueStatus Status { get; private set; } = IssueStatus.ToDo;
    public IssuePriority Priority { get; private set; } = IssuePriority.Medium;
    public DateTime? Created { get; private set; }
    public List<object> Mappings { get; } = [];

    public static JiraIssue From(JsonElement element)
    {
        var issue = new JiraIssue();
        var fields = element.TryGetProperty("fields", out var f) && f.ValueKind == JsonValueKind.Object ? f : element;

        issue.Key = GetString(element, "key");
        issue.Title = GetString(fields, "summary");
        issue.Description = GetString(fields, "description");
        issue.Created = GetDateTime(fields, "created");

        issue.Type = MapType(GetName(fields, "issuetype"), issue);
        issue.Status = MapStatus(GetName(fields, "status"), issue);
        issue.Priority = MapPriority(GetName(fields, "priority"), issue);
        return issue;
    }

    private static IssueType MapType(string? raw, JiraIssue issue)
    {
        var t = (raw ?? string.Empty).ToLowerInvariant();
        if (t.Contains("bug")) return IssueType.Bug;
        if (t.Contains("story") || t.Contains("feature")) return IssueType.Story;
        if (t.Length > 0 && t != "task" && t != "epic" && t != "subtask")
            issue.Mappings.Add(new { field = "type", from = raw, to = "Task" });
        return IssueType.Task;
    }

    private static IssueStatus MapStatus(string? raw, JiraIssue issue)
    {
        // Trazer's five-status machine mapped to Jira's status names. Anything Trazer
        // doesn't have falls back to the closest equivalent and is reported.
        return (raw ?? string.Empty).ToLowerInvariant() switch
        {
            "todo" or "to do" or "backlog" or "open" or "new" or "prepared" => IssueStatus.ToDo,
            "in progress" or "in progress" or "doing" or "selected for development" or "active" => IssueStatus.InProgress,
            "in review" or "code review" or "review" or "needs review" => IssueStatus.InReview,
            "qa" or "testing" or "test" or "waiting for qa" or "in testing" => IssueStatus.QA,
            "done" or "closed" or "resolved" or "complete" or "completed" or "shipped" or "verified" => IssueStatus.Done,
            var other when other.Length > 0 => FallbackStatus(raw, issue),
            _ => IssueStatus.ToDo
        };
    }

    private static IssueStatus FallbackStatus(string? raw, JiraIssue issue)
    {
        issue.Mappings.Add(new { field = "status", from = raw, to = "ToDo" });
        return IssueStatus.ToDo;
    }

    private static IssuePriority MapPriority(string? raw, JiraIssue issue)
    {
        var p = (raw ?? string.Empty).ToLowerInvariant();
        if (p.Contains("highest") || p.Contains("urgent") || p.Contains("blocker")) return IssuePriority.Urgent;
        if (p.Contains("high")) return IssuePriority.High;
        if (p.Contains("low")) return IssuePriority.Low;
        if (p.Length > 0 && !p.Contains("medium") && !p.Contains("normal") && !p.Contains("trivial"))
        {
            issue.Mappings.Add(new { field = "priority", from = raw, to = "Medium" });
            return IssuePriority.Medium;
        }
        return IssuePriority.Medium;
    }

    private static string? GetString(JsonElement element, string property)
    {
        if (element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String)
            return value.GetString();
        return null;
    }

    private static string? GetName(JsonElement element, string property)
    {
        if (element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Object
            && value.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
            return name.GetString();
        return GetString(element, property);
    }

    private static DateTime? GetDateTime(JsonElement element, string property)
    {
        if (element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            && DateTime.TryParse(value.GetString(), out var parsed))
            return DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
        return null;
    }
}

// Allocates per-project issue numbers with the same SELECT … FOR UPDATE lock used by
// the main create endpoint, so it can't race with the UI.
public class IssueNumberAllocator(TrazerDbContext db, Guid projectId)
{
    public async Task<int> NextAsync()
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var project = await db.Projects
            .FromSqlInterpolated($"SELECT * FROM \"Projects\" WHERE \"Id\" = {projectId} FOR UPDATE")
            .FirstAsync();
        project.LastIssueNumber++;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return project.LastIssueNumber;
    }
}