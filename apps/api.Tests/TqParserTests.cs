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

    [Fact]
    public void Parses_Is_Empty()
    {
        var expr = Assert.IsType<TqIsNull>(TqParser.Parse("assignee is empty"));
        Assert.Equal("assignee", expr.Field);
        Assert.False(expr.Not);
    }

    [Fact]
    public void Parses_Is_Not_Empty()
    {
        var expr = Assert.IsType<TqIsNull>(TqParser.Parse("epic is not empty"));
        Assert.Equal("epic", expr.Field);
        Assert.True(expr.Not);
    }

    [Fact]
    public void Parses_Is_Null()
    {
        Assert.IsType<TqIsNull>(TqParser.Parse("sprint is null"));
        Assert.IsType<TqIsNull>(TqParser.Parse("estimate is not null"));
    }

    [Fact]
    public void Empty_Keyword_Remains_A_Value_After_Equals()
    {
        var expr = Assert.IsType<TqComparison>(TqParser.Parse("label = empty"));
        Assert.Equal("empty", Assert.IsType<TqValue.String>(expr.Value).Text);
    }

    [Fact]
    public void Parses_CurrentUser_Function()
    {
        var expr = TqParser.Parse("assignee = currentUser()");
        Assert.IsType<TqValue.Me>(Assert.IsType<TqComparison>(expr).Value);
    }

    [Fact]
    public void Parses_Now_Function()
    {
        var expr = TqParser.Parse("updated <= now()");
        Assert.IsType<TqValue.Now>(Assert.IsType<TqComparison>(expr).Value);
    }

    [Fact]
    public void Parses_Relative_Date()
    {
        var expr = TqParser.Parse("created >= -7d");
        var rel = Assert.IsType<TqValue.RelativeDate>(Assert.IsType<TqComparison>(expr).Value);
        Assert.Equal(-7, rel.Amount);
        Assert.Equal("d", rel.Unit);
    }

    [Fact]
    public void Parses_Relative_Date_Week()
    {
        var rel = Assert.IsType<TqValue.RelativeDate>(
            Assert.IsType<TqComparison>(TqParser.Parse("created >= -2w")).Value);
        Assert.Equal(-2, rel.Amount);
        Assert.Equal("w", rel.Unit);
    }

    [Fact]
    public void Parses_Greater_Than_Operators()
    {
        Assert.Equal(">", Assert.IsType<TqComparison>(TqParser.Parse("estimate > 3")).Operator);
        Assert.Equal(">=", Assert.IsType<TqComparison>(TqParser.Parse("created >= -7d")).Operator);
        Assert.Equal("<", Assert.IsType<TqComparison>(TqParser.Parse("estimate < 3")).Operator);
        Assert.Equal("<=", Assert.IsType<TqComparison>(TqParser.Parse("updated <= now()")).Operator);
    }

    [Fact]
    public void Parses_Order_By()
    {
        var query = TqParser.ParseQuery("status = ToDo ORDER BY priority DESC");
        var sort = Assert.Single(query.Sort);
        Assert.Equal("priority", sort.Field);
        Assert.True(sort.Descending);
    }

    [Fact]
    public void Parses_Multi_Key_Order_By()
    {
        var query = TqParser.ParseQuery("status = ToDo ORDER BY priority DESC, created ASC");
        Assert.Equal(2, query.Sort.Count);
        Assert.Equal("priority", query.Sort[0].Field);
        Assert.True(query.Sort[0].Descending);
        Assert.Equal("created", query.Sort[1].Field);
        Assert.False(query.Sort[1].Descending);
    }

    [Fact]
    public void Parses_Order_By_Without_Filter()
    {
        var query = TqParser.ParseQuery("ORDER BY title ASC");
        Assert.Single(query.Sort);
        Assert.Equal("title", query.Sort[0].Field);
    }

    [Fact]
    public void Parses_Order_By_Number_Field()
    {
        var query = TqParser.ParseQuery("type = Bug ORDER BY number DESC");
        var sort = Assert.Single(query.Sort);
        Assert.Equal("number", sort.Field);
        Assert.True(sort.Descending);
    }

    [Theory]
    [InlineData("status is")]
    [InlineData("assignee is not")]
    [InlineData("ORDER BY")]
    [InlineData("status = ToDo ORDER BY")]
    [InlineData("status = ToDo ORDER BY status, ")]
    public void Throws_On_Invalid_Input2(string input)
    {
        Assert.Throws<TqParseException>(() => TqParser.ParseQuery(input));
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
