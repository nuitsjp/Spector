using Kamishibai;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Spector;
using Spector.Model;
using Spector.Model.IO;
using Spector.View;
using Spector.ViewModel;

// Create a builder by specifying the application and main window.
var builder = KamishibaiApplication<App, MainWindow>.CreateBuilder();

// View, ViewModel
builder.Services.AddPresentation<MainWindow, MainWindowViewModel>();

// ViewModel
builder.Services.AddTransient<AudioInterfaceViewModel>();
builder.Services.AddTransient<RecorderViewModel>();

// Model
builder.Services.AddSingleton<AudioInterface>();

// Repository
builder.Services.AddTransient<ISettingsRepository, SettingsRepository>();

try
{
    // Build and run the application.
    var app = builder.Build();
    await app.RunAsync();
}
catch (Exception e)
{
    Console.WriteLine(e);
    throw;
}
