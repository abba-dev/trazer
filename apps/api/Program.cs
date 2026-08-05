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

builder.Services.AddDbContext<TrazerDbContext>(options =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"));
    if (builder.Environment.IsDevelopment())
        options.LogTo(Console.WriteLine, LogLevel.Information);
});

builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddSingleton<WebhookService>();

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

// Public config so the UI can adapt (e.g. show the demo entry point) without a build-time flag.
app.MapGet("/api/config", (IConfiguration config) => Results.Ok(new
{
    demo = config.GetValue<bool>("Demo:Enabled"),
    demoEmail = Trazer.Api.Services.DemoDefaults.Email
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

app.Run();

public partial class Program;
