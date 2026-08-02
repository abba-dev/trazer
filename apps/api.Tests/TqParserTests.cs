using Trazer.Query;

namespace Trazer.Api.Tests;

public class TqParserTests
{
    [Fact]
    public void Parses_Simple_Comparison()
    {
        var expr = TqParser.Parse("status = QA");
        var cmp = Assert.IsType<TqComparison>(expr);
        Assert.Equal("status", cmp.Field);
        Assert.Equal("=", cmp.Operator);
        Assert.Equal("QA", Assert.IsType<TqValue.String>(cmp.Value).Text);
    }

    [Fact]
    public void Parses_Me_Value()
    {
        var expr = TqParser.Parse("assignee = me");
        var cmp = Assert.IsType<TqComparison>(expr);
        Assert.IsType<TqValue.Me>(cmp.Value);
    }

    [Fact]
    public void Parses_User_Value()
    {
        var expr = TqParser.Parse("assignee = @demo");
        var cmp = Assert.IsType<TqComparison>(expr);
        Assert.Equal("demo", Assert.IsType<TqValue.User>(cmp.Value).Name);
    }

    [Fact]
    public void Parses_Issue_Key_Value()
    {
        var expr = TqParser.Parse("GAME-42");
        var cmp = Assert.IsType<TqComparison>(expr);
        Assert.Equal("text", cmp.Field);
        var key = Assert.IsType<TqValue.IssueKey>(cmp.Value);
        Assert.Equal("GAME", key.ProjectKey);
        Assert.Equal(42, key.Number);
    }

    [Fact]
    public void Parses_Quoted_Value_With_Spaces()
    {
        var expr = TqParser.Parse("epic = \"UI / UX\"");
        var cmp = Assert.IsType<TqComparison>(expr);
        Assert.Equal("UI / UX", Assert.IsType<TqValue.String>(cmp.Value).Text);
    }

    [Fact]
    public void Parses_And_Operator()
    {
        var expr = TqParser.Parse("status = ToDo AND priority = High");
        var and = Assert.IsType<TqAnd>(expr);
        Assert.Equal(2, and.Operands.Count);
    }

    [Fact]
    public void Parses_Or_Operator()
    {
        var expr = TqParser.Parse("status = ToDo OR status = QA");
        var or = Assert.IsType<TqOr>(expr);
        Assert.Equal(2, or.Operands.Count);
    }

    [Fact]
    public void Parses_Parentheses()
    {
        var expr = TqParser.Parse("(status = ToDo OR status = QA) AND project = GAME");
        var and = Assert.IsType<TqAnd>(expr);
        var or = Assert.IsType<TqOr>(and.Operands[0]);
        Assert.Equal(2, or.Operands.Count);
    }

    [Fact]
    public void Parses_In_Operator()
    {
        var expr = TqParser.Parse("status in (Done, QA)");
        var inExpr = Assert.IsType<TqIn>(expr);
        Assert.Equal("status", inExpr.Field);
        Assert.Equal(2, inExpr.Values.Count);
    }

    [Fact]
    public void Parses_NotEqual_And_Contains()
    {
        Assert.IsType<TqComparison>(TqParser.Parse("assignee != me"));
        Assert.IsType<TqComparison>(TqParser.Parse("title ~ render"));
    }

    [Theory]
    [InlineData("status =")]
    [InlineData("status = (broken")]
    [InlineData("status in ()")]
    [InlineData("assignee = @")]
    public void Throws_On_Invalid_Input(string input)
    {
        Assert.Throws<TqParseException>(() => TqParser.Parse(input));
    }

    [Fact]
    public void Empty_Query_Returns_Empty_And()
    {
        var expr = TqParser.Parse("   ");
        var and = Assert.IsType<TqAnd>(expr);
        Assert.Empty(and.Operands);
    }
}
