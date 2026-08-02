using System.Linq.Expressions;
using Trazer.Api.Domain;

namespace Trazer.Query;

public class TqCompiler(Guid currentUserId, Func<string, Guid?> resolveUserId)
{
    private readonly ParameterExpression _param = Expression.Parameter(typeof(Issue), "i");

    public Expression<Func<Issue, bool>> Compile(TqExpr expr)
    {
        var body = CompileNode(expr);
        return Expression.Lambda<Func<Issue, bool>>(body, _param);
    }

    private Expression CompileNode(TqExpr expr) => expr switch
    {
        TqAnd a => Combine(a.Operands, Expression.AndAlso),
        TqOr o => Combine(o.Operands, Expression.OrElse),
        TqComparison c => CompileComparison(c),
        TqIn i => CompileIn(i),
        TqIsNull n => CompileIsNull(n),
        _ => throw new TqParseException("Unsupported expression node")
    };

    private Expression Combine(List<TqExpr> operands, Func<Expression, Expression, Expression> combinator)
    {
        if (operands.Count == 0)
            return Expression.Constant(true);
        var current = CompileNode(operands[0]);
        foreach (var operand in operands.Skip(1))
            current = combinator(current, CompileNode(operand));
        return current;
    }

    private Expression CompileComparison(TqComparison c)
    {
        var field = c.Field.ToLowerInvariant();

        return c.Value switch
        {
            TqValue.Me => field switch
            {
                "assignee" => EqualNullable(Constant(currentUserId), "AssigneeId"),
                "reporter" => Equal(Constant(currentUserId), "ReporterId"),
                _ => ConstantFalse()
            },
            TqValue.User u => field switch
            {
                "assignee" when resolveUserId(u.Name) is { } id => EqualNullable(Constant(id), "AssigneeId"),
                "reporter" when resolveUserId(u.Name) is { } id2 => Equal(Constant(id2), "ReporterId"),
                _ => ConstantFalse()
            },
            TqValue.IssueKey k => field switch
            {
                "text" => AndAlso(
                    Equal(Constant(k.ProjectKey), "Project.Key"),
                    Equal(Constant(k.Number), "Number")),
                "project" => Equal(Constant(k.ProjectKey), "Project.Key"),
                _ => ConstantFalse()
            },
            TqValue.Numeric n => field switch
            {
                "text" => Equal(Constant(n.Value), "Number"),
                "estimate" => CompileEstimate(c.Operator, n.Value),
                _ => ConstantFalse()
            },
            TqValue.Now => field switch
            {
                "created" => CompileDate("CreatedAt", c.Operator, DateTime.UtcNow),
                "updated" => CompileDate("UpdatedAt", c.Operator, DateTime.UtcNow),
                _ => ConstantFalse()
            },
            TqValue.RelativeDate r => field switch
            {
                "created" => CompileDate("CreatedAt", c.Operator, ResolveRelativeDate(r)),
                "updated" => CompileDate("UpdatedAt", c.Operator, ResolveRelativeDate(r)),
                _ => ConstantFalse()
            },
            TqValue.String s => CompileStringField(field, c.Operator, s.Text),
            _ => ConstantFalse()
        };
    }

    private Expression CompileStringField(string field, string op, string text) => field switch
    {
        "assignee" => CompileUserField("Assignee", "AssigneeId", op, text),
        "reporter" => CompileUserField("Reporter", "ReporterId", op, text),
        "status" => CompileEnum<IssueStatus>(op, text, "Status"),
        "priority" => CompileEnum<IssuePriority>(op, text, "Priority"),
        "type" => CompileEnum<IssueType>(op, text, "Type"),
        "project" => op switch
        {
            "=" => Equal(Constant(text.ToUpperInvariant()), "Project.Key"),
            "!=" => NotEqual(Constant(text.ToUpperInvariant()), "Project.Key"),
            "~" => Contains(Property("Project.Key"), text),
            _ => ConstantFalse()
        },
        "label" => op switch
        {
            "=" => LabelNameMatch(text),
            "!=" => Expression.Not(LabelNameMatch(text)),
            "~" => LabelNameContains(text),
            _ => ConstantFalse()
        },
        "epic" => CompileRef("Epic", "EpicId", op, text),
        "sprint" => CompileRef("Sprint", "SprintId", op, text),
        "release" => CompileRef("Release", "ReleaseId", op, text),
        "title" => CompileText(op, text, "Title"),
        "description" => CompileText(op, text, "Description"),
        "text" => op switch
        {
            "=" => Expression.OrElse(
                Equal(Constant(text), "Title"),
                Equal(Constant(text), "Project.Key")),
            "!=" => Expression.Not(TextContains(text)),
            "~" => TextContains(text),
            _ => ConstantFalse()
        },
        _ => ConstantFalse()
    };

    private Expression CompileUserField(string nav, string fk, string op, string name)
    {
        var resolved = resolveUserId(name) ?? resolveUserId(name.TrimStart('@'));
        if (resolved is null)
            return ConstantFalse();
        return op switch
        {
            "=" => EqualNullable(Constant(resolved.Value), fk),
            "!=" => AndAlso(IsNotNull(fk), NotEqual(Constant(resolved.Value), fk)),
            "~" => NameContains(nav, name),
            _ => ConstantFalse()
        };
    }

    private Expression CompileEnum<T>(string op, string text, string property) where T : struct, Enum
    {
        if (!Enum.TryParse<T>(text, ignoreCase: true, out var parsed))
            return ConstantFalse();
        return op switch
        {
            "=" => Equal(Constant(parsed), property),
            "!=" => NotEqual(Constant(parsed), property),
            "~" => Contains(Property(property), text),
            _ => ConstantFalse()
        };
    }

    private Expression CompileRef(string nav, string fk, string op, string text) => op switch
    {
        "=" => RefNameMatch(nav, text),
        "!=" => AndAlso(IsNotNull(fk), Expression.Not(RefNameMatch(nav, text))),
        "~" => RefNameContains(nav, text),
        _ => ConstantFalse()
    };

    private Expression CompileText(string op, string text, string property) => op switch
    {
        "=" => Equal(Constant(text), property),
        "!=" => Expression.Not(Contains(Property(property), text)),
        "~" => Contains(Property(property), text),
        _ => ConstantFalse()
    };

    private Expression CompileEstimate(string op, long value) => op switch
    {
        "=" => Expression.Equal(Property("Estimate"), Expression.Convert(Constant((int)value), typeof(int?))),
        "!=" => Expression.NotEqual(Property("Estimate"), Expression.Convert(Constant((int)value), typeof(int?))),
        ">" => Expression.GreaterThan(Property("Estimate"), Expression.Convert(Constant((int)value), typeof(int?))),
        ">=" => Expression.GreaterThanOrEqual(Property("Estimate"), Expression.Convert(Constant((int)value), typeof(int?))),
        "<" => Expression.LessThan(Property("Estimate"), Expression.Convert(Constant((int)value), typeof(int?))),
        "<=" => Expression.LessThanOrEqual(Property("Estimate"), Expression.Convert(Constant((int)value), typeof(int?))),
        _ => ConstantFalse()
    };

    private Expression CompileDate(string property, string op, DateTime value)
    {
        var target = Expression.Constant(value);
        return op switch
        {
            "=" => Expression.Equal(Property(property), target),
            "!=" => Expression.NotEqual(Property(property), target),
            ">" => Expression.GreaterThan(Property(property), target),
            ">=" => Expression.GreaterThanOrEqual(Property(property), target),
            "<" => Expression.LessThan(Property(property), target),
            "<=" => Expression.LessThanOrEqual(Property(property), target),
            _ => ConstantFalse()
        };
    }

    private static DateTime ResolveRelativeDate(TqValue.RelativeDate r) => r.Unit switch
    {
        "d" => DateTime.UtcNow.AddDays(r.Amount),
        "w" => DateTime.UtcNow.AddDays(r.Amount * 7),
        "h" => DateTime.UtcNow.AddHours(r.Amount),
        _ => DateTime.UtcNow
    };

    private Expression CompileIsNull(TqIsNull expr)
    {
        var field = expr.Field.ToLowerInvariant();
        return field switch
        {
            "assignee" => NullCheck("AssigneeId", expr.Not),
            "epic" => NullCheck("EpicId", expr.Not),
            "sprint" => NullCheck("SprintId", expr.Not),
            "release" => NullCheck("ReleaseId", expr.Not),
            "estimate" => NullCheck("Estimate", expr.Not),
            "description" => NullCheck("Description", expr.Not),
            "title" or "text" => Expression.Constant(expr.Not),
            _ => ConstantFalse()
        };
    }

    private Expression NullCheck(string property, bool not)
    {
        var prop = Property(property);
        var nullValue = Expression.Constant(null, prop.Type);
        return not
            ? Expression.NotEqual(prop, nullValue)
            : Expression.Equal(prop, nullValue);
    }

    private Expression CompileIn(TqIn expr)
    {
        var field = expr.Field.ToLowerInvariant();
        var parts = new List<Expression>();
        foreach (var value in expr.Values)
        {
            var part = value switch
            {
                TqValue.Me => field switch
                {
                    "assignee" => EqualNullable(Constant(currentUserId), "AssigneeId"),
                    "reporter" => Equal(Constant(currentUserId), "ReporterId"),
                    _ => ConstantFalse()
                },
                TqValue.User u => field switch
                {
                    "assignee" when resolveUserId(u.Name) is { } id => EqualNullable(Constant(id), "AssigneeId"),
                    "reporter" when resolveUserId(u.Name) is { } id2 => Equal(Constant(id2), "ReporterId"),
                    _ => ConstantFalse()
                },
                TqValue.IssueKey k => field switch
                {
                    "project" => Equal(Constant(k.ProjectKey), "Project.Key"),
                    "text" => AndAlso(Equal(Constant(k.ProjectKey), "Project.Key"), Equal(Constant(k.Number), "Number")),
                    _ => ConstantFalse()
                },
                TqValue.Numeric n => field switch
                {
                    "text" => Equal(Constant(n.Value), "Number"),
                    "estimate" => Equal(Constant(n.Value), "Estimate"),
                    _ => ConstantFalse()
                },
                TqValue.String s => CompileInString(field, s.Text),
                _ => ConstantFalse()
            };
            if (part != ConstantFalse())
                parts.Add(part);
        }
        return parts.Count == 0
            ? ConstantFalse()
            : parts.Skip(1).Aggregate(parts[0], Expression.OrElse);
    }

    private Expression CompileInString(string field, string text) => field switch
    {
        "status" => EnumMatch<IssueStatus>(text, "Status"),
        "priority" => EnumMatch<IssuePriority>(text, "Priority"),
        "type" => EnumMatch<IssueType>(text, "Type"),
        "project" => Equal(Constant(text.ToUpperInvariant()), "Project.Key"),
        "label" => LabelNameMatch(text),
        "epic" => RefNameMatch("Epic", text),
        "sprint" => RefNameMatch("Sprint", text),
        "release" => RefNameMatch("Release", text),
        "title" => Equal(Constant(text), "Title"),
        "description" => Equal(Constant(text), "Description"),
        "text" => Expression.OrElse(
            Equal(Constant(text), "Title"),
            Equal(Constant(text), "Project.Key")),
        _ => ConstantFalse()
    };

    private Expression EnumMatch<T>(string text, string property) where T : struct, Enum =>
        Enum.TryParse<T>(text, ignoreCase: true, out var parsed)
            ? Equal(Constant(parsed), property)
            : ConstantFalse();

    private Expression TextContains(string text)
    {
        var numberPart = long.TryParse(text, out var n) ? Equal(Constant(n), "Number") : ConstantFalse();
        return Expression.OrElse(
            Contains(Property("Title"), text),
            OrElse(Contains(Property("Project.Key"), text), numberPart));
    }

    private static MemberExpression LabelName(ParameterExpression il) =>
        Expression.Property(Expression.Property(il, "Label"), "Name");

    private Expression LabelNameMatch(string name)
    {
        var il = Expression.Parameter(typeof(IssueLabel), "il");
        return Expression.Call(
            typeof(Enumerable), "Any", [typeof(IssueLabel)],
            Property("IssueLabels"),
            Expression.Lambda<Func<IssueLabel, bool>>(
                Expression.Equal(LabelName(il), Expression.Constant(name)),
                il));
    }

    private Expression LabelNameContains(string text)
    {
        var il = Expression.Parameter(typeof(IssueLabel), "il");
        return Expression.Call(
            typeof(Enumerable), "Any", [typeof(IssueLabel)],
            Property("IssueLabels"),
            Expression.Lambda<Func<IssueLabel, bool>>(
                Contains(LabelName(il), text),
                il));
    }

    private Expression RefNameMatch(string nav, string name) =>
        Equal(Constant(name), $"{nav}.Name");

    private Expression RefNameContains(string nav, string text) =>
        Contains(Property($"{nav}.Name"), text);

    private Expression NameContains(string nav, string text) =>
        Contains(Property($"{nav}.Name"), text);

    private Expression Contains(MemberExpression source, string text) =>
        Expression.Call(
            Expression.Call(source, nameof(string.ToLower), null),
            nameof(string.Contains), null,
            Expression.Constant(text.ToLowerInvariant()));

    private Expression Equal(Expression value, string property) =>
        Expression.Equal(Property(property), value);

    private Expression NotEqual(Expression value, string property) =>
        Expression.NotEqual(Property(property), value);

    private Expression EqualNullable(Expression value, string fk) =>
        Expression.Equal(Property(fk), Expression.Convert(value, typeof(Guid?)));

    private Expression IsNotNull(string fk) =>
        Expression.NotEqual(Property(fk), Expression.Constant(null, typeof(Guid?)));

    private Expression AndAlso(Expression left, Expression right) => Expression.AndAlso(left, right);

    private Expression OrElse(Expression left, Expression right) => Expression.OrElse(left, right);

    private Expression Constant(object value) => Expression.Constant(value, value.GetType());

    private Expression ConstantFalse() => Expression.Constant(false);

    private MemberExpression Property(string path)
    {
        Expression current = _param;
        foreach (var part in path.Split('.'))
            current = Expression.Property(current, part);
        return (MemberExpression)current;
    }
}

