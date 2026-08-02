using System.Text.RegularExpressions;

namespace Trazer.Query;

public static class TqParser
{
    private static readonly Regex IssueKeyPattern = new(@"^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$", RegexOptions.Compiled);
    private static readonly Regex NumberPattern = new(@"^-?\d+$", RegexOptions.Compiled);
    private static readonly Regex RelativeDatePattern = new(@"^-(\d+)([dhw])$", RegexOptions.Compiled);

    public static TqExpr Parse(string input) => ParseQuery(input).Filter;

    public static TqQuery ParseQuery(string input)
    {
        var tokens = TqTokenizer.Tokenize(input);
        if (tokens.Count == 0)
            return new TqQuery(new TqAnd([]), []);

        var pos = 0;
        TqExpr expr;
        if (tokens[0].Type == TqTokenType.OrderBy)
        {
            expr = new TqAnd([]);
        }
        else
        {
            expr = ParseOr(tokens, ref pos);
        }

        var sort = new List<TqSortKey>();
        if (pos < tokens.Count && tokens[pos].Type == TqTokenType.OrderBy)
        {
            pos++;
            while (true)
            {
                if (pos >= tokens.Count)
                    throw new TqParseException("Expected a field after ORDER BY");
                if (tokens[pos].Type != TqTokenType.Field)
                    throw new TqParseException($"Expected a field after ORDER BY, got '{tokens[pos].Text}' at position {tokens[pos].Position}");
                var field = tokens[pos].Text.ToLowerInvariant();
                pos++;
                var descending = false;
                if (pos < tokens.Count && tokens[pos].Type == TqTokenType.Desc)
                {
                    descending = true;
                    pos++;
                }
                else if (pos < tokens.Count && tokens[pos].Type == TqTokenType.Asc)
                {
                    pos++;
                }
                sort.Add(new TqSortKey(field, descending));
                if (pos < tokens.Count && tokens[pos].Type == TqTokenType.Comma)
                {
                    pos++;
                    continue;
                }
                break;
            }
        }

        if (pos < tokens.Count)
            throw new TqParseException($"Unexpected token '{tokens[pos].Text}' at position {tokens[pos].Position}");
        return new TqQuery(expr, sort);
    }

    private static TqExpr ParseOr(List<TqToken> tokens, ref int pos)
    {
        var operands = new List<TqExpr> { ParseAnd(tokens, ref pos) };
        while (pos < tokens.Count && tokens[pos].Type == TqTokenType.Or)
        {
            pos++;
            operands.Add(ParseAnd(tokens, ref pos));
        }
        return operands.Count == 1 ? operands[0] : new TqOr(operands);
    }

    private static TqExpr ParseAnd(List<TqToken> tokens, ref int pos)
    {
        var operands = new List<TqExpr> { ParsePrimary(tokens, ref pos) };
        while (pos < tokens.Count && tokens[pos].Type == TqTokenType.And)
        {
            pos++;
            operands.Add(ParsePrimary(tokens, ref pos));
        }
        return operands.Count == 1 ? operands[0] : new TqAnd(operands);
    }

    private static TqExpr ParsePrimary(List<TqToken> tokens, ref int pos)
    {
        var token = tokens[pos];

        if (token.Type == TqTokenType.LeftParen)
        {
            pos++;
            var inner = ParseOr(tokens, ref pos);
            if (pos >= tokens.Count || tokens[pos].Type != TqTokenType.RightParen)
                throw new TqParseException($"Expected ')' at position {tokens[pos].Position}");
            pos++;
            return inner;
        }

        if (token.Type == TqTokenType.Field)
        {
            return ParseComparison(tokens, ref pos);
        }

        if (token.Type == TqTokenType.Value)
        {
            pos++;
            return new TqComparison("text", "~", ParseValue(token));
        }

        throw new TqParseException($"Unexpected token '{token.Text}' at position {token.Position}");
    }

    private static TqExpr ParseComparison(List<TqToken> tokens, ref int pos)
    {
        var field = tokens[pos].Text.ToLowerInvariant();
        pos++;

        if (pos >= tokens.Count)
            throw new TqParseException($"Expected an operator after field '{field}'");

        if (tokens[pos].Type == TqTokenType.Is)
        {
            pos++;
            var not = false;
            if (pos < tokens.Count && tokens[pos].Type == TqTokenType.Not)
            {
                not = true;
                pos++;
            }
            if (pos >= tokens.Count || (tokens[pos].Type != TqTokenType.Empty && tokens[pos].Type != TqTokenType.Null))
                throw new TqParseException($"Expected 'empty' or 'null' after 'is' for field '{field}'");
            pos++;
            return new TqIsNull(field, not);
        }

        if (tokens[pos].Type == TqTokenType.In)
        {
            pos++;
            if (pos >= tokens.Count || tokens[pos].Type != TqTokenType.LeftParen)
                throw new TqParseException($"Expected '(' after 'in' for field '{field}'");
            pos++;
            var values = new List<TqValue>();
            while (pos < tokens.Count && tokens[pos].Type != TqTokenType.RightParen)
            {
                if (tokens[pos].Type != TqTokenType.Value)
                    throw new TqParseException($"Expected a value inside 'in (...)' for field '{field}'");
                values.Add(ParseValue(tokens[pos]));
                pos++;
                if (pos < tokens.Count && tokens[pos].Type == TqTokenType.Comma)
                    pos++;
            }
            if (pos >= tokens.Count || tokens[pos].Type != TqTokenType.RightParen)
                throw new TqParseException($"Expected ')' to close 'in' list for field '{field}'");
            pos++;
            if (values.Count == 0)
                throw new TqParseException($"'in' list must contain at least one value for field '{field}'");
            return new TqIn(field, values);
        }

        if (tokens[pos].Type != TqTokenType.Operator)
            throw new TqParseException($"Expected an operator after field '{field}', got '{tokens[pos].Text}'");
        var op = tokens[pos].Text;
        pos++;

        if (pos >= tokens.Count || tokens[pos].Type != TqTokenType.Value)
            throw new TqParseException($"Expected a value after '{field} {op}'");
        var value = ParseValue(tokens[pos]);
        pos++;

        return new TqComparison(field, op, value);
    }

    private static TqValue ParseValue(TqToken token)
    {
        var text = token.Text;
        if (text.Equals("me", StringComparison.OrdinalIgnoreCase))
            return new TqValue.Me();
        if (text.Equals("currentUser()", StringComparison.OrdinalIgnoreCase))
            return new TqValue.Me();
        if (text.Equals("now", StringComparison.OrdinalIgnoreCase) || text.Equals("now()", StringComparison.OrdinalIgnoreCase))
            return new TqValue.Now();
        if (text.StartsWith('@'))
            return new TqValue.User(text[1..]);
        if (RelativeDatePattern.IsMatch(text))
        {
            var m = RelativeDatePattern.Match(text);
            return new TqValue.RelativeDate(-int.Parse(m.Groups[1].Value), m.Groups[2].Value);
        }
        if (IssueKeyPattern.IsMatch(text))
        {
            var m = IssueKeyPattern.Match(text);
            return new TqValue.IssueKey(m.Groups[1].Value.ToUpperInvariant(), int.Parse(m.Groups[2].Value));
        }
        if (NumberPattern.IsMatch(text))
            return new TqValue.Numeric(long.Parse(text));
        return new TqValue.String(text);
    }
}
