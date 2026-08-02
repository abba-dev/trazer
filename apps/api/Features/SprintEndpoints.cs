using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;

namespace Trazer.Api.Features;

public static class SprintEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/projects/{projectKey}/sprints").RequireAuthorization();

        group.MapGet("/", async (string projectKey, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var sprints = await db.Sprints
                .Include(s => s.Issues)
                .Where(s => s.ProjectId == project.Id)
                .OrderBy(s => s.CreatedAt)
                .ToListAsync();
            return Results.Ok(sprints.Select(s => s.ToDto()));
        });

        group.MapPost("/", async (string projectKey, CreateSprintRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var sprint = new Sprint
            {
                ProjectId = project.Id,
                Name = req.Name.Trim(),
                Goal = req.Goal,
                StartDate = req.StartDate,
                EndDate = req.EndDate
            };
            db.Sprints.Add(sprint);
            await db.SaveChangesAsync();
            return Results.Created($"/projects/{project.Key}/sprints/{sprint.Id}", sprint.ToDto());
        });

        group.MapPatch("/{sprintId}", async (string projectKey, Guid sprintId, UpdateSprintRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var sprint = await db.Sprints.SingleOrDefaultAsync(s => s.Id == sprintId && s.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Sprint not found");
            if (req.Name != null) sprint.Name = req.Name.Trim();
            if (req.Goal != null) sprint.Goal = req.Goal;
            if (req.StartDate.HasValue) sprint.StartDate = req.StartDate;
            if (req.EndDate.HasValue) sprint.EndDate = req.EndDate;
            if (req.IsActive.HasValue)
            {
                if (req.IsActive.Value)
                    await db.Sprints.Where(s => s.ProjectId == project.Id).ExecuteUpdateAsync(set => set.SetProperty(s => s.IsActive, false));
                sprint.IsActive = req.IsActive.Value;
            }
            await db.SaveChangesAsync();
            return Results.Ok(sprint.ToDto());
        });

        group.MapDelete("/{sprintId}", async (string projectKey, Guid sprintId, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var sprint = await db.Sprints.SingleOrDefaultAsync(s => s.Id == sprintId && s.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Sprint not found");
            db.Sprints.Remove(sprint);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/{sprintId}/issues", async (string projectKey, Guid sprintId, SprintIssuesRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var sprint = await db.Sprints.SingleOrDefaultAsync(s => s.Id == sprintId && s.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Sprint not found");
            await db.Issues
                .Where(i => i.ProjectId == project.Id && req.IssueIds.Contains(i.Id))
                .ExecuteUpdateAsync(set => set
                    .SetProperty(i => i.SprintId, sprint.Id)
                    .SetProperty(i => i.UpdatedAt, DateTime.UtcNow));
            return Results.NoContent();
        });
    }

    private static async Task<Project> GetProjectAsync(TrazerDbContext db, string key)
    {
        var project = await db.Projects.SingleOrDefaultAsync(p => p.Key == key.ToUpperInvariant())
            ?? throw ApiException.NotFound("Project not found");
        return project;
    }
}

public record CreateSprintRequest(string Name, string? Goal, DateTime? StartDate, DateTime? EndDate);

public record UpdateSprintRequest(string? Name, string? Goal, DateTime? StartDate, DateTime? EndDate, bool? IsActive);

public record SprintIssuesRequest(List<Guid> IssueIds);
