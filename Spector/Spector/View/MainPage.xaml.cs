using Spector.ViewModel;

namespace Spector.View;

/// <summary>
/// MainPage.xaml の相互作用ロジック
/// </summary>
public partial class MainPage
{
    public MainPage()
    {
        InitializeComponent();
    }
}

public class DesignTimeMainPageViewModel() :
    MainPageViewModel(
        default!,
        default!,
        default!,
        default!);