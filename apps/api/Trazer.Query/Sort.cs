using System.Linq.Expressions;
using Trazer.Api.Domain;

namespace Trazer.Query;

public static class TqSort
{
    public static IQueryable<Issue> Apply(IQueryable<Issue> query, IReadOnlyList<TqSortKey> keys)
    {
        if (keys.Count == 0)
            return query.OrderByDescending(i => i.UpdatedAt);

        var first = Key(keys[0]);
        var ordered = keys[0].Descending ? query.OrderByDescending(first) : query.OrderBy(first);
        for (var i = 1; i < keys.Count; i++)
        {
            var key = Key(keys[i]);
            ordered = keys[i].Descending ? ordered.ThenByDescending(key) : ordered.ThenBy(key);
        }
        return ordered;
    }

    private static Expression<Func<Issue, object?>> Key(TqSortKey key) => key.Field.ToLowerInvariant() switch
    {
        "status" => i => i.Status,
        "priority" => i => i.Priority,
        "type" => i => i.Type,
        "title" => i => i.Title != null ? i.Title.ToLower() : "",
        "number" => i => i.Number,
        "estimate" => i => i.Estimate,
        "created" => i => i.CreatedAt,
        "updated" => i => i.UpdatedAt,
        "project" => i => i.Project != null ? i.Project.Key : "",
        "assignee" => i => i.Assignee != null ? i.Assignee.Name : "",
        "epic" => i => i.Epic != null ? i.Epic.Name : "",
        "sprint" => i => i.Sprint != null ? i.Sprint.Name : "",
        "release" => i => i.Release != null ? i.Release.Name : "",
        _ => i => i.UpdatedAt
    };
}
