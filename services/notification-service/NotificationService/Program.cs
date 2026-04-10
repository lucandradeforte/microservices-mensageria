using NotificationService;
using NotificationService.Application;
using NotificationService.Infrastructure;

var builder = Host.CreateApplicationBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(options =>
{
    options.IncludeScopes = true;
});

builder.Services.AddSingleton<NotificationRepository>();
builder.Services.AddSingleton<RabbitMqPublisher>();
builder.Services.AddSingleton<SendNotificationUseCase>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
