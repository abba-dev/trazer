using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;
using Trazer.Query;

namespace Trazer.Api.Features;

public static class FilterEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/filters").RequireAuthorization();

        group.MapGet("/", async (TrazerDbContext db, CurrentUserService current) =>
        {
            var filters = await db.SavedFilters
                .Where(f => f.UserId == current.CurrentUserId)
                .OrderBy(f => f.Name)
                .ToListAsync();
            return Results.Ok(filters.Select(f => f.ToDto()));
        });

        group.MapPost("/", async (CreateFilterRequest req, TrazerDbContext db, CurrentUserService current) =>
        {
            var name = req.Name?.Trim();
            var query = req.Query?.Trim();
            if (string.IsNullOrWhiteSpace(name))
                throw ApiException.BadRequest("Filter name is required");
            if (string.IsNullOrWhiteSpace(query))
                throw ApiException.BadRequest("Filter query is required");

            try
            {
                TqParser.ParseQuery(query);
            }
            catch (TqParseException ex)
            {
                throw ApiException.BadRequest($"Invalid query: {ex.Message}");
            }

            var exists = await db.SavedFilters.AnyAsync(f =>
                f.UserId == current.CurrentUserId && f.Name == name);
            if (exists)
                throw ApiException.Conflict($"A filter named '{name}' already exists");

            var filter = new SavedFilter
            {
                UserId = current.CurrentUserId,
                Name = name,
                Query = query
            };
            db.SavedFilters.Add(filter);
            await db.SaveChangesAsync();
            return Results.Created($"/api/filters/{filter.Id}", filter.ToDto());
        });

        group.MapPatch("/{id:guid}", async (Guid id, UpdateFilterRequest req, TrazerDbContext db, CurrentUserService current) =>
        {
            var filter = await db.SavedFilters
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == current.CurrentUserId)
                ?? throw ApiException.NotFound("Filter not found");

            if (req.Name is not null)
            {
                var name = req.Name.Trim();
                if (string.IsNullOrWhiteSpace(name))
                    throw ApiException.BadRequest("Filter name cannot be empty");
                var clash = await db.SavedFilters.AnyAsync(f =>
                    f.UserId == current.CurrentUserId && f.Id != id && f.Name == name);
                if (clash)
                    throw ApiException.Conflict($"A filter named '{name}' already exists");
                filter.Name = name;
            }

            if (req.Query is not null)
            {
                var query = req.Query.Trim();
                if (string.IsNullOrWhiteSpace(query))
                    throw ApiException.BadRequest("Filter query cannot be empty");
                try
                {
                    TqParser.ParseQuery(query);
                }
                catch (TqParseException ex)
                {
                    throw ApiException.BadRequest($"Invalid query: {ex.Message}");
                }
                filter.Query = query;
            }

            await db.SaveChangesAsync();
            return Results.Ok(filter.ToDto());
        });

        group.MapDelete("/{id:guid}", async (Guid id, TrazerDbContext db, CurrentUserService current) =>
        {
            var filter = await db.SavedFilters
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == current.CurrentUserId)
                ?? throw ApiException.NotFound("Filter not found");
            db.SavedFilters.Remove(filter);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

public record CreateFilterRequest(string? Name, string? Query);

public record UpdateFilterRequest(string? Name, string? Query);
