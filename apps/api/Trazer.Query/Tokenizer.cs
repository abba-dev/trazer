namespace Trazer.Query;

public enum TqTokenType
{
    Field,
    Value,
    Operator,
    And,
    Or,
    In,
    LeftParen,
    RightParen,
    Comma
}

public record TqToken(TqTokenType Type, string Text, int Position);

public static class TqTokenizer
{
    private static readonly HashSet<string> Fields =
    [
        "assignee", "reporter", "status", "priority", "project", "label",
        "epic", "sprint", "release", "type", "title", "description", "text", "estimate"
    ];

    public static List<TqToken> Tokenize(string input)
    {
        var tokens = new List<TqToken>();
        var i = 0;
        var length = input.Length;

        while (i < length)
        {
            var c = input[i];

            if (char.IsWhiteSpace(c))
            {
                i++;
                continue;
            }

            if (c == '(') { tokens.Add(new TqToken(TqTokenType.LeftParen, "(", i)); i++; continue; }
            if (c == ')') { tokens.Add(new TqToken(TqTokenType.RightParen, ")", i)); i++; continue; }
            if (c == ',') { tokens.Add(new TqToken(TqTokenType.Comma, ",", i)); i++; continue; }

            if (c == '=')
            {
                tokens.Add(new TqToken(TqTokenType.Operator, "=", i)); i++; continue;
            }
            if (c == '!')
            {
                if (i + 1 < length && input[i + 1] == '=')
                {
                    tokens.Add(new TqToken(TqTokenType.Operator, "!=", i));
                    i += 2;
                    continue;
                }
                throw new TqParseException($"Unexpected character '!' at position {i}");
            }
            if (c == '~')
            {
                tokens.Add(new TqToken(TqTokenType.Operator, "~", i)); i++; continue;
            }
            if (c == '@')
            {
                var start = i;
                i++;
                while (i < length && (char.IsLetterOrDigit(input[i]) || input[i] is '.' or '_' or '-'))
                    i++;
                if (i == start + 1)
                    throw new TqParseException($"Expected a user name after '@' at position {start}");
                tokens.Add(new TqToken(TqTokenType.Value, input[start..i], start));
                continue;
            }
            if (c == '"')
            {
                var start = i;
                i++;
                var sb = new System.Text.StringBuilder();
                while (i < length && input[i] != '"')
                {
                    if (input[i] == '\\' && i + 1 < length)
                    {
                        i++;
                        sb.Append(input[i]);
                    }
                    else
                    {
                        sb.Append(input[i]);
                    }
                    i++;
                }
                if (i >= length)
                    throw new TqParseException($"Unterminated string starting at position {start}");
                i++;
                tokens.Add(new TqToken(TqTokenType.Value, sb.ToString(), start));
                continue;
            }

            var wordStart = i;
            while (i < length && !char.IsWhiteSpace(input[i]) && input[i] is not '(' and not ')' and not ',')
                i++;
            var word = input[wordStart..i];
            if (word.Length == 0)
                throw new TqParseException($"Unexpected character '{input[i]}' at position {i}");

            tokens.Add(word.ToLowerInvariant() switch
            {
                "and" => new TqToken(TqTokenType.And, word, wordStart),
                "or" => new TqToken(TqTokenType.Or, word, wordStart),
                "in" => new TqToken(TqTokenType.In, word, wordStart),
                _ when Fields.Contains(word.ToLowerInvariant()) => new TqToken(TqTokenType.Field, word, wordStart),
                _ => new TqToken(TqTokenType.Value, word, wordStart)
            });
        }

        return tokens;
    }
}

public class TqParseException(string message) : Exception(message);
