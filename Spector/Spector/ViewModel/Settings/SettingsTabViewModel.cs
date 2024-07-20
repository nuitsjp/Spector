using CommunityToolkit.Mvvm.Input;
using Spector.Model;

namespace Spector.ViewModel.Settings;

public partial class SettingsTabViewModel : ObservableBase
{
    [RelayCommand]
    private void AddRule()
    {
        Firewall.AddRule();
    }

    [RelayCommand]
    private void RemoveRule()
    {
        Firewall.RemoveRule();
    }

}