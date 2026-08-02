using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Services;
using Trazer.Query;

namespace Trazer.Api.Features;

public static class SearchEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/search", async (string? q, TrazerDbContext db, CurrentUserService current) =>
        {
            var accessibleProjectIds = await db.Projects
                .Where(p => p.OwnerId == current.CurrentUserId
                    || p.Members.Any(m => m.UserId == current.CurrentUserId))
                .Select(p => p.Id)
                .ToListAsync();

            var query = db.Issues
                .Include(i => i.Project)
                .Include(i => i.Assignee)
                .Include(i => i.Reporter)
                .Include(i => i.Epic)
                .Include(i => i.Sprint)
                .Include(i => i.Release)
                .Include(i => i.IssueLabels).ThenInclude(il => il.Label)
                .Where(i => accessibleProjectIds.Contains(i.ProjectId));

            var sortKeys = new List<TqSortKey>();

            if (!string.IsNullOrWhiteSpace(q))
            {
                TqQuery parsed;
                try
                {
                    parsed = TqParser.ParseQuery(q);
                }
                catch (TqParseException ex)
                {
                    throw ApiException.BadRequest($"Invalid query: {ex.Message}");
                }

                var compiler = new TqCompiler(current.CurrentUserId, name => ResolveUserIdAsync(db, name).GetAwaiter().GetResult());
                query = query.Where(compiler.Compile(parsed.Filter));
                sortKeys = parsed.Sort;
            }

            var issues = await TqSort.Apply(query, sortKeys)
                .Take(200)
                .ToListAsync();
            return Results.Ok(issues.Select(i => i.ToDto()));
        }).RequireAuthorization();
    }

    private static async Task<Guid?> ResolveUserIdAsync(TrazerDbContext db, string name)
    {
        var user = await db.Users
            .Where(u => u.Name.ToLower() == name.ToLower() || u.Email == name.ToLower())
            .Select(u => new { u.Id })
            .FirstOrDefaultAsync();
        return user?.Id;
    }
}
