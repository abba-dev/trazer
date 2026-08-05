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
    }
}

public record CreateProjectRequest(string Key, string Name, string? Description);

public record UpdateProjectRequest(string? Name, string? Description, string? WipLimits);

public static class ProjectMapping
{
    public static ProjectDto ToDto(this Project p) =>
        new(p.Id, p.Key, p.Name, p.Description, p.Issues.Count, p.WipLimits, p.CreatedAt);
}
