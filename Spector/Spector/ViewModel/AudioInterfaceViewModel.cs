using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using Reactive.Bindings;
using Spector.Model;

namespace Spector.ViewModel;

public class AudioInterfaceViewModel
{
    public event EventHandler? LiveDataUpdated;

    public AudioInterfaceViewModel()
    {
        Devices = AudioInterface
            .Devices
            .ToReadOnlyReactiveCollection(device => new DeviceViewModel(device));
        DispatcherTimer = new DispatcherTimer
        {
            Interval = RecordingConfig.Default.RefreshRate.Interval
        };
        DispatcherTimer.Tick += Update;
    }

    private AudioInterface AudioInterface { get; } = new();
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

public class DeviceViewModel(IDevice device) : ObservableObject
{
    private IDevice Device { get; } = device;

    public string Name => Device.Name;

    public double[] LiveData { get; } = CreateEmptyData();

    private static double[] CreateEmptyData()
    {
        var liveData = new double[4800];
        Array.Fill(liveData, Decibel.Minimum.AsPrimitive());
        return liveData;
    }

    public void UpdateLiveData()
    {
        // "scroll" the whole chart to the left
        Array.Copy(LiveData, 1, LiveData, 0, LiveData.Length - 1);

        // place the newest data point at the end
        LiveData[^1] = Device.Level.AsPrimitive();
    }

}