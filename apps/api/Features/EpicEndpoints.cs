using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;

namespace Trazer.Api.Features;

public static class EpicEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/projects/{projectKey}/epics").RequireAuthorization();

        group.MapGet("/", async (string projectKey, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var epics = await db.Epics
                .Include(e => e.Issues)
                .Where(e => e.ProjectId == project.Id)
                .OrderBy(e => e.Name)
                .ToListAsync();
            return Results.Ok(epics.Select(e => e.ToDto()));
        });

        group.MapPost("/", async (string projectKey, CreateEpicRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var epic = new Epic
            {
                ProjectId = project.Id,
                Name = req.Name.Trim(),
                Summary = req.Summary,
                Color = req.Color ?? "#808080"
            };
            db.Epics.Add(epic);
            await db.SaveChangesAsync();
            return Results.Created($"/projects/{project.Key}/epics/{epic.Id}", epic.ToDto());
        });

        group.MapPatch("/{epicId}", async (string projectKey, Guid epicId, UpdateEpicRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var epic = await db.Epics
                .Include(e => e.Issues)
                .SingleOrDefaultAsync(e => e.Id == epicId && e.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Epic not found");
            if (req.Name != null) epic.Name = req.Name.Trim();
            if (req.Summary != null) epic.Summary = req.Summary;
            if (req.Color != null) epic.Color = req.Color;
            await db.SaveChangesAsync();
            return Results.Ok(epic.ToDto());
        });

        group.MapDelete("/{epicId}", async (string projectKey, Guid epicId, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var epic = await db.Epics.SingleOrDefaultAsync(e => e.Id == epicId && e.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Epic not found");
            db.Epics.Remove(epic);
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
}

public record CreateEpicRequest(string Name, string? Summary, string? Color);

public record UpdateEpicRequest(string? Name, string? Summary, string? Color);
