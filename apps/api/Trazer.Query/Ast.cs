namespace Trazer.Query;

public abstract record TqExpr;

public sealed record TqComparison(string Field, string Operator, TqValue Value) : TqExpr;

public sealed record TqIn(string Field, List<TqValue> Values) : TqExpr;

public sealed record TqAnd(List<TqExpr> Operands) : TqExpr;

public sealed record TqOr(List<TqExpr> Operands) : TqExpr;

public abstract record TqValue
{
    public sealed record Me : TqValue;

    public sealed record User(string Name) : TqValue;

    public sealed record IssueKey(string ProjectKey, int Number) : TqValue;

    public sealed record String(string Text) : TqValue;

    public sealed record Numeric(long Value) : TqValue;
}
