using System.Windows.Threading;
using Reactive.Bindings;
using Spector.Model;

namespace Spector.ViewModel;

public class AudioInterfaceViewModel
{
    public event EventHandler? LiveDataUpdated;

    public AudioInterfaceViewModel(AudioInterface audioInterface)
    {
        AudioInterface = audioInterface;
        Devices = AudioInterface
            .Devices
            .ToReadOnlyReactiveCollection(device => new DeviceViewModel(device));
        DispatcherTimer = new DispatcherTimer
        {
            Interval = RecordingConfig.Default.RefreshRate.Interval
        };
        DispatcherTimer.Tick += Update;
    }

    private AudioInterface AudioInterface { get; }
    public ReadOnlyReactiveCollection<DeviceViewModel> Devices { get; }

    private DispatcherTimer DispatcherTimer { get; }

    public async Task ActivateAsync()
    {
        await AudioInterface.ActivateAsync();
        DispatcherTimer.Start();
    }

    private void Update(object? sender, EventArgs e)
    {
        foreach (var device in Devices)
        {
            device.UpdateLiveData();
        }

        LiveDataUpdated?.Invoke(this, EventArgs.Empty);
    }

}