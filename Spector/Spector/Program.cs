using Kamishibai;
using Microsoft.Extensions.Hosting;
using Spector;
using Spector.ViewModel;

// Create a builder by specifying the application and main window.
var builder = KamishibaiApplication<App, MainWindow>.CreateBuilder();

builder.Services.AddPresentation<MainWindow, MainWindowViewModel>();

// Build and run the application.
var app = builder.Build();
app.RunAsync();