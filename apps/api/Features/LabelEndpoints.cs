using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;

namespace Trazer.Api.Features;

public static class LabelEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/projects/{projectKey}/labels").RequireAuthorization();

        group.MapGet("/", async (string projectKey, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var labels = await db.Labels
                .Where(l => l.ProjectId == project.Id)
                .OrderBy(l => l.Name)
                .ToListAsync();
            return Results.Ok(labels.Select(l => l.ToDto()));
        });

        group.MapPost("/", async (string projectKey, CreateLabelRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var name = req.Name.Trim();
            if (await db.Labels.AnyAsync(l => l.ProjectId == project.Id && l.Name == name))
                throw ApiException.Conflict($"Label '{name}' already exists");
            var label = new Label { ProjectId = project.Id, Name = name, Color = req.Color ?? "#808080" };
            db.Labels.Add(label);
            await db.SaveChangesAsync();
            return Results.Created($"/projects/{project.Key}/labels/{label.Id}", label.ToDto());
        });

        group.MapDelete("/{labelId}", async (string projectKey, Guid labelId, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var label = await db.Labels.SingleOrDefaultAsync(l => l.Id == labelId && l.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Label not found");
            db.Labels.Remove(label);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/{issueNumber}/{labelId}", async (string projectKey, int issueNumber, Guid labelId, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await db.Issues
                .Include(i => i.IssueLabels)
                .SingleOrDefaultAsync(i => i.ProjectId == project.Id && i.Number == issueNumber)
                ?? throw ApiException.NotFound("Issue not found");
            if (await db.Labels.AnyAsync(l => l.Id == labelId && l.ProjectId == project.Id) == false)
                throw ApiException.NotFound("Label not found");
            if (issue.IssueLabels.All(il => il.LabelId != labelId))
            {
                issue.IssueLabels.Add(new IssueLabel { IssueId = issue.Id, LabelId = labelId });
                await db.SaveChangesAsync();
            }
            return Results.NoContent();
        });

        group.MapDelete("/{issueNumber}/{labelId}", async (string projectKey, int issueNumber, Guid labelId, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var issue = await db.Issues
                .Include(i => i.IssueLabels)
                .SingleOrDefaultAsync(i => i.ProjectId == project.Id && i.Number == issueNumber)
                ?? throw ApiException.NotFound("Issue not found");
            var link = issue.IssueLabels.SingleOrDefault(il => il.LabelId == labelId);
            if (link != null)
            {
                db.IssueLabels.Remove(link);
                await db.SaveChangesAsync();
            }
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

public record CreateLabelRequest(string Name, string? Color);
