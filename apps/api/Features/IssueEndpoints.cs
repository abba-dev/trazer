using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

public static class IssueEndpoints
{
    private const string UploadsPath = "uploads";

    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/projects/{projectKey}").RequireAuthorization();

        group.MapGet("/issues", async (string projectKey, TrazerDbContext db,
            string? status, string? sprint, string? epic, string? release, Guid? assigneeId, string? q) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var query = db.Issues
                .Include(i => i.Assignee)
                .Include(i => i.Reporter)
                .Include(i => i.Epic)
                .Include(i => i.Sprint)
                .Include(i => i.Release)
                .Include(i => i.IssueLabels).ThenInclude(il => il.Label)
                .Where(i => i.ProjectId == project.Id);

            if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(i => i.Status.ToString() == status);
            if (!string.IsNullOrWhiteSpace(sprint))
            {
                if (sprint == "none") query = query.Where(i => i.SprintId == null);
                else if (Guid.TryParse(sprint, out var sprintId)) query = query.Where(i => i.SprintId == sprintId);
            }
            if (!string.IsNullOrWhiteSpace(epic))
            {
                if (epic == "none") query = query.Where(i => i.EpicId == null);
                else if (Guid.TryParse(epic, out var epicId)) query = query.Where(i => i.EpicId == epicId);
            }
            if (!string.IsNullOrWhiteSpace(release))
            {
                if (release == "none") query = query.Where(i => i.ReleaseId == null);
                else if (Guid.TryParse(release, out var releaseId)) query = query.Where(i => i.ReleaseId == releaseId);
            }
            if (assigneeId.HasValue)
                query = query.Where(i => i.AssigneeId == assigneeId.Value);
            if (!string.IsNullOrWhiteSpace(q))
                query = query.Where(i => i.Title.Contains(q) || (i.Description != null && i.Description.Contains(q)));

            var issues = await query
                .OrderBy(i => i.Status)
                .ThenBy(i => i.Position)
                .ThenBy(i => i.Number)
                .ToListAsync();
            return Results.Ok(issues.Select(i => i.ToDto()));
        });

        group.MapPost("/issues", async (string projectKey, CreateIssueRequest req, TrazerDbContext db, CurrentUserService current, WebhookService webhooks) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var nextNumber = await NextIssueNumberAsync(db, project.Id);

            var maxPosition = await db.Issues
                .Where(i => i.ProjectId == project.Id && i.Status.ToString() == (req.Status ?? "ToDo"))
                .Select(i => (int?)i.Position)
                .MaxAsync() ?? -1;

            var issue = new Issue
            {
                ProjectId = project.Id,
                Number = nextNumber,
                Title = req.Title.Trim(),
                Description = req.Description,
                Type = ParseEnum(req.Type, IssueType.Task),
                Status = ParseEnum(req.Status, IssueStatus.ToDo),
                Priority = ParseEnum(req.Priority, IssuePriority.Medium),
                AssigneeId = req.AssigneeId,
                ReporterId = current.CurrentUserId,
                EpicId = req.EpicId,
                SprintId = req.SprintId,
                ReleaseId = req.ReleaseId,
                Estimate = req.Estimate,
                Position = maxPosition + 1
            };
            db.Issues.Add(issue);
            await db.SaveChangesAsync();

            if (req.LabelIds is { Length: > 0 })
            {
                var validLabelIds = await db.Labels
                    .Where(l => l.ProjectId == project.Id)
                    .Select(l => l.Id)
                    .ToListAsync();
                foreach (var labelId in req.LabelIds.Distinct().Where(validLabelIds.Contains))
                {
                    db.IssueLabels.Add(new IssueLabel { IssueId = issue.Id, LabelId = labelId });
                }
                await db.SaveChangesAsync();
            }

            var created = await GetIssueAsync(db, project.Id, issue.Number);
            await webhooks.DispatchAsync(db, project.Id, "issue.created", current.CurrentUserId, created.ToDto());
            return Results.Created($"/projects/{project.Key}/issues/{issue.Number}", created.ToDto());
        });

        group.MapGet("/issues/{number}", async (string projectKey, int number, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            return Results.Ok(issue.ToDto());
        });

        group.MapPatch("/issues/{number}", async (string projectKey, int number, UpdateIssueRequest req, TrazerDbContext db, CurrentUserService current, WebhookService webhooks) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueWithHistoryAsync(db, project.Id, number);
            var actorId = current.CurrentUserId;

            if (req.Title is not null) TrackChange(db, issue, "title", issue.Title, req.Title.Trim(), actorId);
            if (req.Description is not null) TrackChange(db, issue, "description", issue.Description, req.Description, actorId);
            if (req.Type is not null) TrackChange(db, issue, "type", issue.Type.ToString(), req.Type, actorId);
            if (req.Status is not null) TrackChange(db, issue, "status", issue.Status.ToString(), req.Status, actorId);
            if (req.Priority is not null) TrackChange(db, issue, "priority", issue.Priority.ToString(), req.Priority, actorId);
            TrackChange(db, issue, "assignee", issue.AssigneeId?.ToString(), req.AssigneeId?.ToString(), actorId);
            TrackChange(db, issue, "epic", issue.EpicId?.ToString(), req.EpicId?.ToString(), actorId);
            TrackChange(db, issue, "sprint", issue.SprintId?.ToString(), req.SprintId?.ToString(), actorId);
            TrackChange(db, issue, "release", issue.ReleaseId?.ToString(), req.ReleaseId?.ToString(), actorId);
            TrackChange(db, issue, "estimate", issue.Estimate?.ToString(), req.Estimate?.ToString(), actorId);

            if (req.Title != null) issue.Title = req.Title.Trim();
            if (req.Description != null) issue.Description = req.Description;
            if (req.Type != null) issue.Type = ParseEnum(req.Type, issue.Type);
            if (req.Status != null) issue.Status = ParseEnum(req.Status, issue.Status);
            if (req.Priority != null) issue.Priority = ParseEnum(req.Priority, issue.Priority);
            issue.AssigneeId = req.AssigneeId;
            issue.EpicId = req.EpicId;
            issue.SprintId = req.SprintId;
            issue.ReleaseId = req.ReleaseId;
            issue.Estimate = req.Estimate;
            if (req.Position.HasValue) issue.Position = req.Position.Value;

            issue.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await webhooks.DispatchAsync(db, project.Id, "issue.updated", actorId, issue.ToDto());
            return Results.Ok(issue.ToDto());
        });

        group.MapDelete("/issues/{number}", async (string projectKey, int number, TrazerDbContext db, CurrentUserService current, WebhookService webhooks) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            var dto = issue.ToDto();
            db.Issues.Remove(issue);
            await db.SaveChangesAsync();
            await webhooks.DispatchAsync(db, project.Id, "issue.deleted", current.CurrentUserId, dto);
            return Results.NoContent();
        });

        group.MapGet("/issues/{number}/history", async (string projectKey, int number, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await db.Issues
                .Include(i => i.History).ThenInclude(h => h.Actor)
                .SingleOrDefaultAsync(i => i.ProjectId == project.Id && i.Number == number)
                ?? throw ApiException.NotFound("Issue not found");
            var entries = issue.History.OrderByDescending(h => h.CreatedAt).Select(h => h.ToDto());
            return Results.Ok(entries);
        });

        group.MapGet("/issues/{number}/comments", async (string projectKey, int number, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            var comments = await db.Comments
                .Include(c => c.Author)
                .Where(c => c.IssueId == issue.Id)
                .OrderBy(c => c.CreatedAt)
                .ToListAsync();
            return Results.Ok(comments.Select(c => c.ToDto()));
        });

        group.MapPost("/issues/{number}/comments", async (string projectKey, int number, CreateCommentRequest req, TrazerDbContext db, CurrentUserService current, WebhookService webhooks) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            if (string.IsNullOrWhiteSpace(req.Body))
                throw ApiException.BadRequest("Comment body is required");

            var comment = new Comment
            {
                IssueId = issue.Id,
                AuthorId = current.CurrentUserId,
                Body = req.Body.Trim()
            };
            db.Comments.Add(comment);
            await db.SaveChangesAsync();
            await db.Entry(comment).Reference(c => c.Author).LoadAsync();
            await webhooks.DispatchAsync(db, project.Id, "issue.commented", current.CurrentUserId, new { comment.IssueId, comment.Id, comment.Body, comment.CreatedAt });
            return Results.Created($"/projects/{project.Key}/issues/{number}/comments/{comment.Id}", comment.ToDto());
        });

        group.MapDelete("/issues/{number}/comments/{commentId}", async (string projectKey, int number, Guid commentId, TrazerDbContext db, CurrentUserService current) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            var comment = await db.Comments
                .SingleOrDefaultAsync(c => c.Id == commentId && c.IssueId == issue.Id)
                ?? throw ApiException.NotFound("Comment not found");
            if (comment.AuthorId != current.CurrentUserId)
                throw ApiException.Forbidden("Only the author can delete this comment");
            db.Comments.Remove(comment);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/issues/{number}/attachments", async (string projectKey, int number, HttpRequest request, TrazerDbContext db, CurrentUserService current) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            if (!request.HasFormContentType || request.Form.Files.Count == 0)
                throw ApiException.BadRequest("No file provided");

            Directory.CreateDirectory(UploadsPath);
            var results = new List<AttachmentDto>();
            foreach (var file in request.Form.Files)
            {
                if (file.Length > 20 * 1024 * 1024)
                    throw ApiException.BadRequest("File exceeds 20 MB limit");

                var storedName = $"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";
                var path = Path.Combine(UploadsPath, storedName);
                await using (var stream = File.Create(path))
                {
                    await file.CopyToAsync(stream);
                }

                var attachment = new Attachment
                {
                    IssueId = issue.Id,
                    UploadedById = current.CurrentUserId,
                    FileName = Path.GetFileName(file.FileName),
                    StoredName = storedName,
                    ContentType = file.ContentType,
                    Size = file.Length
                };
                db.Attachments.Add(attachment);
                await db.SaveChangesAsync();
                await db.Entry(attachment).Reference(a => a.UploadedBy).LoadAsync();
                results.Add(attachment.ToDto());
            }
            return Results.Created($"/projects/{project.Key}/issues/{number}/attachments", results);
        });

        group.MapGet("/issues/{number}/attachments", async (string projectKey, int number, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            var attachments = await db.Attachments
                .Include(a => a.UploadedBy)
                .Where(a => a.IssueId == issue.Id)
                .OrderByDescending(a => a.UploadedAt)
                .ToListAsync();
            return Results.Ok(attachments.Select(a => a.ToDto()));
        });

        group.MapGet("/issues/{number}/attachments/{attachmentId}", async (string projectKey, int number, Guid attachmentId, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            var attachment = await db.Attachments
                .SingleOrDefaultAsync(a => a.Id == attachmentId && a.IssueId == issue.Id)
                ?? throw ApiException.NotFound("Attachment not found");
            var path = Path.Combine(UploadsPath, attachment.StoredName);
            if (!File.Exists(path))
                throw ApiException.NotFound("Attachment file missing");
            return Results.File(Path.GetFullPath(path), attachment.ContentType, attachment.FileName);
        });

        group.MapDelete("/issues/{number}/attachments/{attachmentId}", async (string projectKey, int number, Guid attachmentId, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await GetIssueAsync(db, project.Id, number);
            var attachment = await db.Attachments
                .SingleOrDefaultAsync(a => a.Id == attachmentId && a.IssueId == issue.Id)
                ?? throw ApiException.NotFound("Attachment not found");
            var path = Path.Combine(UploadsPath, attachment.StoredName);
            if (File.Exists(path))
                File.Delete(path);
            db.Attachments.Remove(attachment);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task<Project> GetProjectAsync(TrazerDbContext db, string key)
    {
        var project = await db.Projects.SingleOrDefaultAsync(p => p.Key == key.ToUpperInvariant())
            ?? throw ApiException.NotFound("Project not found");
        return project;
    }

    private static async Task<int> NextIssueNumberAsync(TrazerDbContext db, Guid projectId)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var project = await db.Projects
            .FromSqlInterpolated($"SELECT * FROM \"Projects\" WHERE \"Id\" = {projectId} FOR UPDATE")
            .FirstOrDefaultAsync()
            ?? throw ApiException.NotFound("Project not found");
        project.LastIssueNumber++;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return project.LastIssueNumber;
    }

    private static async Task<Issue> GetIssueAsync(TrazerDbContext db, Guid projectId, int number)
    {
        var issue = await db.Issues
            .Include(i => i.Assignee)
            .Include(i => i.Reporter)
            .Include(i => i.Epic)
            .Include(i => i.Sprint)
            .Include(i => i.Release)
            .Include(i => i.IssueLabels).ThenInclude(il => il.Label)
            .SingleOrDefaultAsync(i => i.ProjectId == projectId && i.Number == number)
            ?? throw ApiException.NotFound("Issue not found");
        return issue;
    }

    private static async Task<Issue> GetIssueWithHistoryAsync(TrazerDbContext db, Guid projectId, int number)
    {
        var issue = await db.Issues
            .Include(i => i.Assignee)
            .Include(i => i.Reporter)
            .Include(i => i.Epic)
            .Include(i => i.Sprint)
            .Include(i => i.Release)
            .Include(i => i.IssueLabels).ThenInclude(il => il.Label)
            .SingleOrDefaultAsync(i => i.ProjectId == projectId && i.Number == number)
            ?? throw ApiException.NotFound("Issue not found");
        return issue;
    }

    private static void TrackChange(TrazerDbContext db, Issue issue, string field, string? oldValue, string? newValue, Guid actorId)
    {
        if (oldValue == newValue) return;
        db.HistoryEntries.Add(new HistoryEntry
        {
            IssueId = issue.Id,
            ActorId = actorId,
            Field = field,
            OldValue = oldValue,
            NewValue = newValue
        });
    }

    private static T ParseEnum<T>(string? value, T fallback) where T : struct, Enum =>
        Enum.TryParse<T>(value, ignoreCase: true, out var result) ? result : fallback;
}

public record CreateIssueRequest(
    string Title,
    string? Description,
    string? Type,
    string? Status,
    string? Priority,
    Guid? AssigneeId,
    Guid? EpicId,
    Guid? SprintId,
    Guid? ReleaseId,
    int? Estimate,
    Guid[]? LabelIds);

public record UpdateIssueRequest(
    string? Title,
    string? Description,
    string? Type,
    string? Status,
    string? Priority,
    Guid? AssigneeId,
    Guid? EpicId,
    Guid? SprintId,
    Guid? ReleaseId,
    int? Estimate,
    int? Position);

public record CreateCommentRequest(string Body);
