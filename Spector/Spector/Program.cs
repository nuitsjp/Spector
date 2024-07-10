using Kamishibai;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Spector;
using Spector.Model;
using Spector.Model.IO;
using Spector.View;
using Spector.View.Measure;
using Spector.ViewModel;
using Spector.ViewModel.AnalysisTab;
using Spector.ViewModel.MeasureTab;
using RecorderViewModel = Spector.ViewModel.RecorderViewModel;

// Create a builder by specifying the application and main window.
var builder = KamishibaiApplication<App, MainWindow>.CreateBuilder();

// View, ViewModel
builder.Services.AddPresentation<MainWindow, MainWindowViewModel>();
builder.Services.AddPresentation<LoadingPage, LoadingPageViewModel>();
builder.Services.AddPresentation<MainPage, MainPageViewModel>();

// ViewModel
builder.Services.AddSingleton<MeasureTabViewModel>();
builder.Services.AddSingleton<AnalysisTabViewModel>();
builder.Services.AddSingleton<AudioInterfaceViewModel>();
builder.Services.AddSingleton<RecorderViewModel>();

// Model
builder.Services.AddSingleton<AudioInterface>();
builder.Services.AddSingleton<Spector.Model.Recorder>();

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
