using System.Windows;
using Spector.Model;

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