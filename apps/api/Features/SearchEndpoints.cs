using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

public static class SearchEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/search", async (string? q, string? project, Guid? assignee, string? status, TrazerDbContext db, CurrentUserService current) =>
        {
            var projects = await db.Projects
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
                .Where(i => projects.Contains(i.ProjectId));

            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                var keyMatch = System.Text.RegularExpressions.Regex.Match(
                    term.ToUpperInvariant(), @"^([A-Z][A-Z0-9]{1,9})-(\d+)$");
                if (keyMatch.Success)
                {
                    var key = keyMatch.Groups[1].Value;
                    var number = int.Parse(keyMatch.Groups[2].Value);
                    query = query.Where(i =>
                        i.Project!.Key == key
                        && i.Number == number
                        || i.Project!.Key == key
                        && i.Number.ToString() == keyMatch.Groups[2].Value);
                }
                else
                {
                    query = query.Where(i =>
                        i.Title.Contains(term)
                        || (i.Description != null && i.Description.Contains(term))
                        || i.Project!.Key.Contains(term)
                        || i.Number.ToString().Contains(term));
                }
            }
            if (!string.IsNullOrWhiteSpace(project))
            {
                var key = project.Trim().ToUpperInvariant();
                query = query.Where(i => i.Project!.Key == key);
            }
            if (assignee.HasValue)
                query = query.Where(i => i.AssigneeId == assignee.Value);
            if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(i => i.Status.ToString() == status);

            var issues = await query
                .OrderByDescending(i => i.UpdatedAt)
                .Take(200)
                .ToListAsync();
            return Results.Ok(issues.Select(i => i.ToDto()));
        }).RequireAuthorization();
    }
}
