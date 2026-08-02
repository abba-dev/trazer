using Microsoft.EntityFrameworkCore;
using Trazer.Api.Data;

namespace Trazer.Api.Services;

public class SeedHostedService(IServiceScopeFactory scopeFactory, ILogger<SeedHostedService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrazerDbContext>();
        await db.Database.MigrateAsync(stoppingToken);
        await DbSeeder.SeedAsync(db);
        logger.LogInformation("Database seeded with demo data");
    }
}
