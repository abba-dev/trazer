using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

// Import external issue exports (Jira JSON, GitHub CSV) into a project.
// The strict schema wins: unknown statuses/types/priorities map to the closest Trazer
// equivalent, and re-importing the same file updates issues (matched by SourceKey)
// instead of duplicating them. Both endpoints share one upsert loop.
//
// ponytail: single file, pure mappers, no service layer. Assignees/reporters are not
// mapped (the import runs as the current user), comments/attachments are not
// imported. Add them when the strict schema's UX demands it — not before.
public static class ImportEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/projects/{projectKey}/import").RequireAuthorization();

        group.MapPost("/jira", async (string projectKey, HttpRequest request, TrazerDbContext db, CurrentUserService current) =>
        {
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

            var parsed = new List<ImportItem>();
            foreach (var element in root.EnumerateArray())
                parsed.Add(JiraIssue.From(element));
            return await RunImportAsync(projectKey, parsed, db, current);
        });

        group.MapPost("/github", async (string projectKey, HttpRequest request, TrazerDbContext db, CurrentUserService current) =>
        {
            using var reader = new StreamReader(request.Body);
            var rows = CsvParser.Parse(await reader.ReadToEndAsync());
            if (rows.Count == 0)
                throw ApiException.BadRequest("Empty CSV");

            var parsed = new List<ImportItem>();
            foreach (var row in rows)
                parsed.Add(GithubIssue.From(row));
            return await RunImportAsync(projectKey, parsed, db, current);
        });
    }

    // Shared upsert loop: source-key idempotency, labels get-or-create, milestone ->
    // release get-or-create, and a per-item report.
    private static async Task<IResult> RunImportAsync(string projectKey, List<ImportItem> items,
        TrazerDbContext db, CurrentUserService current)
    {
        var project = await db.Projects.SingleOrDefaultAsync(p => p.Key == projectKey.ToUpperInvariant())
            ?? throw ApiException.NotFound("Project not found");

        var actor = await db.Users.FindAsync(current.CurrentUserId)
            ?? throw ApiException.Unauthorized();

        var allocator = new IssueNumberAllocator(db, project.Id);
        var labels = await db.Labels
            .Where(l => l.ProjectId == project.Id)
            .ToDictionaryAsync(l => l.Name, l => l.Id, StringComparer.OrdinalIgnoreCase);
        var releases = await db.Releases
            .Where(r => r.ProjectId == project.Id)
            .ToDictionaryAsync(r => r.Name, r => r.Id, StringComparer.OrdinalIgnoreCase);

        var report = new List<object>();
        int created = 0, updated = 0, skipped = 0;

        foreach (var item in items)
        {
            if (item.SkipReason is not null)
            {
                skipped++;
                report.Add(new { key = item.Key ?? "(no key)", status = "skipped", why = item.SkipReason });
                continue;
            }
            if (string.IsNullOrWhiteSpace(item.Key) || string.IsNullOrWhiteSpace(item.Title))
            {
                skipped++;
                report.Add(new { key = item.Key ?? "(no key)", status = "skipped", why = "missing key or title" });
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

            // Labels get-or-create, then link. GitHub exports labels as "a, b, c".
            var linked = existing?.IssueLabels.Select(il => il.LabelId).ToHashSet()
                ?? new HashSet<Guid>();
            var newIssueId = existing?.Id ?? db.Issues.Local.Last().Id;
            foreach (var labelName in item.LabelNames)
            {
                if (!labels.TryGetValue(labelName, out var labelId))
                {
                    var label = new Label { ProjectId = project.Id, Name = labelName };
                    db.Labels.Add(label);
                    await db.SaveChangesAsync();
                    labels[labelName] = label.Id;
                    labelId = label.Id;
                }
                if (!linked.Contains(labelId))
                {
                    db.IssueLabels.Add(new IssueLabel { IssueId = newIssueId, LabelId = labelId });
                    linked.Add(labelId);
                }
            }

            // Milestone -> release get-or-create.
            if (!string.IsNullOrWhiteSpace(item.ReleaseName))
            {
                if (!releases.TryGetValue(item.ReleaseName!, out var releaseId))
                {
                    var release = new Release { ProjectId = project.Id, Name = item.ReleaseName! };
                    db.Releases.Add(release);
                    await db.SaveChangesAsync();
                    releases[release.Name] = release.Id;
                    releaseId = release.Id;
                }
                if (existing is not null) existing.ReleaseId = releaseId;
            }

            if (item.Mappings.Count > 0)
                report.Add(new { key = item.Key, status = existing is null ? "created" : "updated", transformed = item.Mappings });

            await db.SaveChangesAsync();
        }

        return Results.Ok(new { created, updated, skipped, report });
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}

// Normalized external issue with the strict-schema mappings applied up front so the
// shared loop stays a flat upsert. Unknown enum strings fall back to the middle value
// and the mapping is recorded in Mappings for the report.
public class ImportItem
{
    public string? Key { get; protected set; }
    public string? Title { get; protected set; }
    public string? Description { get; protected set; }
    public IssueType Type { get; protected set; } = IssueType.Task;
    public IssueStatus Status { get; protected set; } = IssueStatus.ToDo;
    public IssuePriority Priority { get; protected set; } = IssuePriority.Medium;
    public DateTime? Created { get; protected set; }
    public List<object> Mappings { get; } = [];
    public List<string> LabelNames { get; } = [];
    public string? ReleaseName { get; protected set; }
    public string? SkipReason { get; protected set; }

    protected static string? GetString(JsonElement element, string property)
    {
        if (element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String)
            return value.GetString();
        return null;
    }

    protected static string? GetName(JsonElement element, string property)
    {
        if (element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Object
            && value.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
            return name.GetString();
        return GetString(element, property);
    }

    protected static DateTime? GetDateTime(JsonElement element, string property)
    {
        if (element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            && DateTime.TryParse(value.GetString(), out var parsed))
            return DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
        return null;
    }
}

public sealed class JiraIssue : ImportItem
{
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
            "in progress" or "doing" or "selected for development" or "active" => IssueStatus.InProgress,
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
}

// GitHub Issues CSV export (Issues -> Export). Columns:
//   number,title,labels,state,assignee,author,date_created,date_updated,date_closed,
//   body,comments,url,type,priority,reporter,pr_number,milestone,timelog
public sealed class GithubIssue : ImportItem
{
    public static GithubIssue From(Dictionary<string, string> row)
    {
        var issue = new GithubIssue();
        var type = Row(row, "type");
        if (type.Equals("Pull Request", StringComparison.OrdinalIgnoreCase))
        {
            issue.SkipReason = "pull request (not an issue)";
            issue.Key = Row(row, "number");
            return issue;
        }

        issue.Key = Row(row, "number");
        issue.Title = Row(row, "title");
        issue.Description = Row(row, "body");
        issue.Created = TryDate(Row(row, "date_created"));
        issue.Status = Row(row, "state").Equals("closed", StringComparison.OrdinalIgnoreCase)
            ? IssueStatus.Done
            : IssueStatus.ToDo;
        issue.Type = IssueType.Task;
        issue.Priority = MapPriority(Row(row, "priority"), issue);
        issue.ReleaseName = BlankToNull(Row(row, "milestone"));
        issue.LabelNames.AddRange(Row(row, "labels")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(l => l.Length > 0));
        return issue;
    }

    private static string Row(Dictionary<string, string> row, string key) =>
        row.TryGetValue(key, out var v) ? v : string.Empty;

    private static string? BlankToNull(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static DateTime? TryDate(string value) =>
        DateTime.TryParse(value, out var parsed) ? DateTime.SpecifyKind(parsed, DateTimeKind.Utc) : null;

    private static IssuePriority MapPriority(string raw, GithubIssue issue)
    {
        var p = raw.ToLowerInvariant();
        if (p.Contains("urgent") || p.Contains("critical")) return IssuePriority.Urgent;
        if (p.Contains("high")) return IssuePriority.High;
        if (p.Contains("low")) return IssuePriority.Low;
        if (p.Length > 0) issue.Mappings.Add(new { field = "priority", from = raw, to = "Medium" });
        return IssuePriority.Medium;
    }
}

// RFC 4180-ish CSV parser: quoted fields, escaped quotes, newlines inside quotes.
// Header row becomes the dictionary keys. GitHub's export quotes fields that contain
// commas/newlines, so a real parser (not Split(',')) is required.
public static class CsvParser
{
    public static List<Dictionary<string, string>> Parse(string text)
    {
        var rows = new List<List<string>>();
        var fields = new List<string>();
        var sb = new System.Text.StringBuilder();
        bool inQuotes = false;
        int i = 0;

        void EndField()
        {
            fields.Add(sb.ToString());
            sb.Clear();
        }
        void EndRow()
        {
            EndField();
            if (fields.Count > 0 && fields.Any(f => f.Length > 0))
                rows.Add(new List<string>(fields));
            fields.Clear();
        }

        while (i < text.Length)
        {
            char c = text[i];
            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"') { sb.Append('"'); i += 2; continue; }
                    inQuotes = false;
                }
                else sb.Append(c);
            }
            else
            {
                switch (c)
                {
                    case '"': inQuotes = true; break;
                    case ',': EndField(); break;
                    case '\r': break;
                    case '\n': EndRow(); break;
                    default: sb.Append(c); break;
                }
            }
            i++;
        }
        if (sb.Length > 0 || fields.Count > 0) EndRow();

        // First row is the header; map every subsequent row to name -> value.
        var result = new List<Dictionary<string, string>>();
        if (rows.Count == 0) return result;
        var headers = rows[0].Select(h => h.Trim()).ToArray();
        for (int r = 1; r < rows.Count; r++)
        {
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var row = rows[r];
            for (int c = 0; c < row.Count && c < headers.Length; c++)
                dict[headers[c]] = row[c];
            result.Add(dict);
        }
        return result;
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