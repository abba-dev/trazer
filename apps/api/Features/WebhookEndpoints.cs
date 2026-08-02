using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

public static class WebhookEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/projects/{projectKey}").RequireAuthorization();

        group.MapGet("/webhooks", async (string projectKey, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var webhooks = await db.Webhooks
                .Where(w => w.ProjectId == project.Id)
                .OrderBy(w => w.CreatedAt)
                .ToListAsync();
            return Results.Ok(webhooks.Select(w => w.ToDto()));
        });

        group.MapPost("/webhooks", async (string projectKey, CreateWebhookRequest req, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            if (string.IsNullOrWhiteSpace(req.Url) || !Uri.TryCreate(req.Url, UriKind.Absolute, out var uri) ||
                (uri.Scheme != "http" && uri.Scheme != "https"))
                throw ApiException.BadRequest("A valid http(s) URL is required");

            var events = req.Events is { Length: > 0 } ? string.Join(',', req.Events.Select(e => e.Trim()).Where(e => e.Length > 0)) : "*";
            var webhook = new Webhook
            {
                ProjectId = project.Id,
                Url = req.Url.Trim(),
                Events = events,
                Secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24))
            };
            db.Webhooks.Add(webhook);
            await db.SaveChangesAsync();
            return Results.Created($"/projects/{project.Key}/webhooks/{webhook.Id}", webhook.ToDto());
        });

        group.MapDelete("/webhooks/{id}", async (string projectKey, Guid id, TrazerDbContext db) =>
        {
            var project = await GetProjectAsync(db, projectKey);
            var webhook = await db.Webhooks
                .SingleOrDefaultAsync(w => w.Id == id && w.ProjectId == project.Id)
                ?? throw ApiException.NotFound("Webhook not found");
            db.Webhooks.Remove(webhook);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task<Project> GetProjectAsync(TrazerDbContext db, string key) =>
        await db.Projects.SingleOrDefaultAsync(p => p.Key == key.ToUpperInvariant())
        ?? throw ApiException.NotFound("Project not found");
}

public record CreateWebhookRequest(string Url, string[]? Events);
