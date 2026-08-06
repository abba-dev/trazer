using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Features;
using Trazer.Api.Services;

var builder = WebApplication.CreateBuilder(args);

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is required");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    })
    .AddScheme<AuthenticationSchemeOptions, ApiTokenHandler>(ApiTokenDefaults.AuthenticationScheme, null);

// Public REST API accepts both session JWTs and long-lived API tokens.
builder.Services.AddAuthorization(options =>
{
    options.DefaultPolicy = new AuthorizationPolicyBuilder(JwtBearerDefaults.AuthenticationScheme, ApiTokenDefaults.AuthenticationScheme)
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient();
builder.Services.AddOpenApi();

builder.Services.AddDbContext<TrazerDbContext>(options =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"));
    if (builder.Environment.IsDevelopment())
        options.LogTo(Console.WriteLine, LogLevel.Information);
});

builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddSingleton<WebhookService>();
builder.Services.AddSingleton<LoginThrottle>();

if (builder.Environment.IsDevelopment() || builder.Configuration.GetValue<bool>("Demo:Enabled"))
{
    builder.Services.AddHostedService<SeedHostedService>();
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("dev", policy =>
    {
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TrazerDbContext>();
    db.Database.Migrate();
}

app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseCors("dev");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

// OpenAPI 3.1 spec at /api/openapi.json — generated from the minimal API source via
// Microsoft.AspNetCore.OpenApi.
app.MapOpenApi("/api/openapi.json");

// Self-contained reference UI for the spec (no CDN, works behind the strict CSP).
// ponytail: renders the endpoint list + auth hint, not a full Swagger UI — good enough
// to deprecate README-as-API-docs; swap for Swagger UI when someone asks.
app.MapGet("/api/docs", () => Results.Content(DocsPage.Html, "text/html; charset=utf-8"));

// Public config so the UI can adapt (e.g. show the demo entry point) without a build-time flag.
app.MapGet("/api/config", async (IConfiguration config, Trazer.Api.Data.TrazerDbContext db) => Results.Ok(new
{
    demo = config.GetValue<bool>("Demo:Enabled"),
    demoEmail = Trazer.Api.Services.DemoDefaults.Email,
    setupRequired = !await db.Users.AnyAsync()
}));

AuthEndpoints.Map(app);
ProjectEndpoints.Map(app);
IssueEndpoints.Map(app);
SprintEndpoints.Map(app);
ReleaseEndpoints.Map(app);
LabelEndpoints.Map(app);
EpicEndpoints.Map(app);
SearchEndpoints.Map(app);
FilterEndpoints.Map(app);
WebhookEndpoints.Map(app);
ImportEndpoints.Map(app);
GitEndpoints.Map(app);

app.Run();

// Minimal self-contained docs page. Renders the OpenAPI spec's endpoint list from
// /api/openapi.json. No CDN, no external assets — props to the strict CSP.
internal static class DocsPage
{
    public const string Html = """
        <!doctype html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Trazer API</title>
        <style>
          body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; background:#0a0a0a; color:#ededed; margin:0; }
          main { max-width:900px; margin:0 auto; padding:32px 20px; }
          h1 { font-size:22px; }
          .badge { font-size:11px; border:1px solid #333; padding:2px 8px; border-radius:6px; color:#aaa; }
          .method { font-weight:700; font-size:12px; padding:2px 6px; border-radius:4px; color:#0a0a0a; }
          .get { background:#4ade80; } .post { background:#60a5fa; } .put { background:#fbbf24; }
          .patch { background:#c084fc; } .delete { background:#f87171; }
          ul { list-style:none; padding:0; }
          li { border:1px solid #1f1f1f; border-radius:8px; padding:10px 14px; margin:8px 0; }
          .path { font-family:ui-monospace, monospace; margin-left:8px; }
          .summary { color:#9ca3af; font-size:12px; }
          #loading { color:#9ca3af; }
        </style>
        </head>
        <body>
        <main>
          <h1>Trazer API <span class="badge">OpenAPI 3.1</span></h1>
          <p id="loading">Loading spec…</p>
          <a href="/api/openapi.json" style="color:#60a5fa">Download /api/openapi.json</a>
          <div id="endpoints"></div>
        </main>
        <script>
          const load = async () => {
            const spec = await (await fetch('/api/openapi.json')).json();
            const list = document.getElementById('endpoints');
            const items = Object.entries(spec.paths || {})
              .flatMap(([path, ops]) => ['get','post','put','patch','delete']
                .filter((m) => ops[m])
                .map((m) => ({ m, path, s: ops[m].summary || ops[m].operationId || '' })));
            if (!items.length) { list.innerHTML = '<p id="loading">No operations documented.</p>'; return; }
            list.innerHTML = '<h2>Endpoints</h2><ul>' + items.map(({m,path,s}) =>
              `<li><span class="method ${m}">${m.toUpperCase()}</span><span class="path">${path}</span><span class="summary">${s}</span></li>`
            ).join('') + '</ul>';
            document.getElementById('loading').remove();
          };
          void load();
        </script>
        </body>
        </html>
        """;
}

public partial class Program;
