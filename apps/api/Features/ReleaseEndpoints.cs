using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;

namespace Trazer.Api.Features;

public static class ReleaseEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/projects/{projectKey}/releases").RequireAuthorization();

        group.MapGet("/", async (string projectKey, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var releases = await db.Releases
                .Include(r => r.Issues)
                .Where(r => r.ProjectId == project.Id)
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync();
            return Results.Ok(releases.Select(r => r.ToDto()));
        });

        group.MapPost("/", async (string projectKey, CreateReleaseRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var release = new Release
            {
                ProjectId = project.Id,
                Name = req.Name.Trim(),
                Description = req.Description
            };
            db.Releases.Add(release);
            await db.SaveChangesAsync();
            return Results.Created($"/projects/{project.Key}/releases/{release.Id}", release.ToDto());
        });

        group.MapPatch("/{releaseId}", async (string projectKey, Guid releaseId, UpdateReleaseRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var release = await db.Releases.SingleOrDefaultAsync(r => r.Id == releaseId && r.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Release not found");
            if (req.Name != null) release.Name = req.Name.Trim();
            if (req.Description != null) release.Description = req.Description;
            if (req.Release != null)
            {
                var status = Enum.TryParse<ReleaseStatus>(req.Release, ignoreCase: true, out var parsed)
                    ? parsed
                    : throw ApiException.BadRequest("Invalid release status");
                release.Status = status;
                if (status == ReleaseStatus.Released && release.ReleasedAt == null)
                    release.ReleasedAt = DateTime.UtcNow;
                if (status == ReleaseStatus.Open)
                    release.ReleasedAt = null;
            }
            await db.SaveChangesAsync();
            return Results.Ok(release.ToDto());
        });

        group.MapDelete("/{releaseId}", async (string projectKey, Guid releaseId, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var release = await db.Releases.SingleOrDefaultAsync(r => r.Id == releaseId && r.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Release not found");
            db.Releases.Remove(release);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/{releaseId}/issues", async (string projectKey, Guid releaseId, ReleaseIssuesRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var release = await db.Releases.SingleOrDefaultAsync(r => r.Id == releaseId && r.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Release not found");
            await db.Issues
                .Where(i => i.ProjectId == project.Id && req.IssueIds.Contains(i.Id))
                .ExecuteUpdateAsync(set => set
                    .SetProperty(i => i.ReleaseId, release.Id)
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

public record CreateReleaseRequest(string Name, string? Description);

public record UpdateReleaseRequest(string? Name, string? Description, string? Release);

public record ReleaseIssuesRequest(List<Guid> IssueIds);
