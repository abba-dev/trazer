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
        app.MapGet("/search", async (string? q, TrazerDbContext db, CurrentUserService current) =>
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

            if (!string.IsNullOrWhiteSpace(q))
            {
                TqExpr expr;
                try
                {
                    expr = TqParser.Parse(q);
                }
                catch (TqParseException ex)
                {
                    throw ApiException.BadRequest($"Invalid query: {ex.Message}");
                }

                var compiler = new TqCompiler(current.CurrentUserId, name => ResolveUserIdAsync(db, name).GetAwaiter().GetResult());
                var predicate = compiler.Compile(expr);
                query = query.Where(predicate);
            }

            var issues = await query
                .OrderByDescending(i => i.UpdatedAt)
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
