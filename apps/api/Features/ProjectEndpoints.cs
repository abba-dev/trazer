using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

public static class ProjectEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/projects").RequireAuthorization();

        group.MapGet("/", async (TrazerDbContext db, CurrentUserService current) =>
        {
            var projects = await db.Projects
                .Where(p => p.OwnerId == current.CurrentUserId
                    || p.Members.Any(m => m.UserId == current.CurrentUserId))
                .OrderBy(p => p.Name)
                .Select(p => new ProjectDto(
                    p.Id, p.Key, p.Name, p.Description,
                    p.Issues.Count, p.WipLimits, p.CreatedAt))
                .ToListAsync();
            return Results.Ok(projects);
        });

        group.MapPost("/", async (CreateProjectRequest req, TrazerDbContext db, CurrentUserService current) =>
        {
            var key = req.Key.Trim().ToUpperInvariant();
            if (!System.Text.RegularExpressions.Regex.IsMatch(key, "^[A-Z][A-Z0-9]{1,9}$"))
                throw ApiException.BadRequest("Key must be 2-10 characters, start with a letter, and contain only letters/digits");

            if (await db.Projects.AnyAsync(p => p.Key == key))
                throw ApiException.Conflict($"A project with key {key} already exists");

            var project = new Project
            {
                Key = key,
                Name = req.Name.Trim(),
                Description = req.Description,
                OwnerId = current.CurrentUserId
            };
            project.Members.Add(new ProjectMember { UserId = current.CurrentUserId, Role = "owner" });
            db.Projects.Add(project);
            await db.SaveChangesAsync();
            return Results.Created($"/projects/{project.Key}", project.ToDto());
        });

        group.MapGet("/{key}", async (string key, TrazerDbContext db) =>
        {
            var project = await db.Projects.SingleOrDefaultAsync(p => p.Key == key.ToUpperInvariant())
                ?? throw ApiException.NotFound("Project not found");
            return Results.Ok(project.ToDto());
        });

        group.MapPatch("/{key}", async (string key, UpdateProjectRequest req, TrazerDbContext db) =>
        {
            var project = await db.Projects.SingleOrDefaultAsync(p => p.Key == key.ToUpperInvariant())
                ?? throw ApiException.NotFound("Project not found");
            project.Name = req.Name?.Trim() ?? project.Name;
            project.Description = req.Description ?? project.Description;
            if (req.WipLimits != null)
            {
                if (req.WipLimits.Length > 4096)
                    throw ApiException.BadRequest("WipLimits JSON is too large (max 4096 chars)");
                project.WipLimits = string.IsNullOrWhiteSpace(req.WipLimits) ? null : req.WipLimits;
            }
            await db.SaveChangesAsync();
            return Results.Ok(project.ToDto());
        });

        group.MapDelete("/{key}", async (string key, TrazerDbContext db) =>
        {
            var project = await db.Projects.SingleOrDefaultAsync(p => p.Key == key.ToUpperInvariant())
                ?? throw ApiException.NotFound("Project not found");
            db.Projects.Remove(project);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapGet("/{key}/export", async (string key, string? format, TrazerDbContext db) =>
        {
            var project = await db.Projects
                .Include(p => p.Issues).ThenInclude(i => i.IssueLabels).ThenInclude(il => il.Label)
                .Include(p => p.Issues).ThenInclude(i => i.Assignee)
                .Include(p => p.Issues).ThenInclude(i => i.Reporter)
                .Include(p => p.Issues).ThenInclude(i => i.Epic)
                .Include(p => p.Issues).ThenInclude(i => i.Sprint)
                .Include(p => p.Issues).ThenInclude(i => i.Release)
                .Include(p => p.Issues).ThenInclude(i => i.Comments).ThenInclude(c => c.Author)
                .Include(p => p.Issues).ThenInclude(i => i.Attachments).ThenInclude(a => a.UploadedBy)
                .Include(p => p.Issues).ThenInclude(i => i.History).ThenInclude(h => h.Actor)
                .Include(p => p.Labels)
                .Include(p => p.Epics)
                .Include(p => p.Sprints)
                .Include(p => p.Releases)
                .SingleOrDefaultAsync(p => p.Key == key.ToUpperInvariant())
                ?? throw ApiException.NotFound("Project not found");

            if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
            {
                var csv = ProjectMapping.ExportAsCsv(project);
                return Results.File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8", $"{project.Key}-export-{DateTime.UtcNow:yyyyMMdd}.csv");
            }
            var snapshot = ProjectMapping.ExportAsJson(project);
            return Results.File(System.Text.Encoding.UTF8.GetBytes(System.Text.Json.JsonSerializer.Serialize(snapshot, new System.Text.Json.JsonSerializerOptions { WriteIndented = true })), "application/json; charset=utf-8", $"{project.Key}-export-{DateTime.UtcNow:yyyyMMdd}.json");
        });
    }
}

public record CreateProjectRequest(string Key, string Name, string? Description);

public record UpdateProjectRequest(string? Name, string? Description, string? WipLimits);

public static class ProjectMapping
{
    public static ProjectDto ToDto(this Project p) =>
        new(p.Id, p.Key, p.Name, p.Description, p.Issues.Count, p.WipLimits, p.CreatedAt);

    // ponytail: two export functions. JSON is a full snapshot; CSV is
    // issues-only. Kept in this class because they are pure projections
    // from the already-loaded aggregate (the export endpoint loads the
    // whole project with all the Includes it needs).
    public static string ExportAsCsv(Project p)
    {
        static string Csv(string? s) => "\"" + (s ?? string.Empty).Replace("\"", "\"\"") + "\"";
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("key,number,title,type,status,priority,assignee,reporter,estimate,created,updated,epic,sprint,release");
        foreach (var i in p.Issues.OrderBy(x => x.Number))
        {
            sb.Append(i.Key).Append(',')
              .Append(i.Number).Append(',')
              .Append(Csv(i.Title)).Append(',')
              .Append(i.Type).Append(',')
              .Append(i.Status).Append(',')
              .Append(i.Priority).Append(',')
              .Append(Csv(i.Assignee?.Name)).Append(',')
              .Append(Csv(i.Reporter?.Name)).Append(',')
              .Append(i.Estimate?.ToString() ?? string.Empty).Append(',')
              .Append(i.CreatedAt.ToString("o")).Append(',')
              .Append(i.UpdatedAt.ToString("o")).Append(',')
              .Append(Csv(i.Epic?.Name)).Append(',')
              .Append(Csv(i.Sprint?.Name)).Append(',')
              .Append(Csv(i.Release?.Name))
              .AppendLine();
        }
        return sb.ToString();
    }

    public static object ExportAsJson(Project p) => new
    {
        project = new { p.Id, p.Key, p.Name, p.Description, p.CreatedAt },
        labels = p.Labels.Select(l => new { l.Id, l.Name, l.Color }),
        epics = p.Epics.Select(e => new { e.Id, e.Name, e.Summary, e.Color }),
        sprints = p.Sprints.Select(s => new { s.Id, s.Name, s.Goal, s.StartDate, s.EndDate, s.IsActive, s.CreatedAt }),
        releases = p.Releases.Select(r => new { r.Id, r.Name, r.Description, r.Status, r.ReleasedAt, r.CreatedAt }),
        issues = p.Issues.OrderBy(i => i.Number).Select(i => new
        {
            i.Id, i.Number, i.Key, i.Title, i.Description, i.Type, i.Status, i.Priority,
            i.Estimate, i.Position, i.CreatedAt, i.UpdatedAt,
            assignee = i.Assignee?.Name,
            reporter = i.Reporter?.Name,
            epic = i.Epic?.Name,
            sprint = i.Sprint?.Name,
            release = i.Release?.Name,
            labels = i.IssueLabels.Select(il => il.Label?.Name).Where(n => n != null),
            comments = i.Comments.Select(c => new { c.Id, c.Body, author = c.Author.Name, c.CreatedAt }),
            attachments = i.Attachments.Select(a => new { a.Id, a.FileName, a.ContentType, a.Size, uploadedBy = a.UploadedBy.Name, a.UploadedAt }),
            history = i.History.Select(h => new { h.Id, h.Field, h.OldValue, h.NewValue, actor = h.Actor.Name, h.CreatedAt }),
        }),
    };
}
