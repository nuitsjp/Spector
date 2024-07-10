using System.Windows;
using Spector.Model;
using Spector.ViewModel;

namespace Spector.View;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private void MainWindow_OnLoaded(object sender, RoutedEventArgs e)
    {
        CurrentDispatcher.Dispatcher = Application.Current.Dispatcher;
    }
}

public class DesignTimeMainPageViewModel() : 
    MainWindowViewModel(default!);