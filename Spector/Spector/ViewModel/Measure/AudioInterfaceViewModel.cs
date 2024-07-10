using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.Windows.Threading;
using Reactive.Bindings;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using Spector.Model;

namespace Spector.ViewModel.Measure;

public class AudioInterfaceViewModel : IDisposable
{
    public event EventHandler? LiveDataUpdated;

    public AudioInterfaceViewModel(AudioInterface audioInterface)
    {
        AudioInterface = audioInterface.AddTo(CompositeDisposable);
        Devices = AudioInterface
            .Devices
            .ToReadOnlyReactiveCollection(device => new DeviceViewModel(device))
            .AddTo(CompositeDisposable);
        // デバイスの変更を監視する
        Devices.ToCollectionChanged()
            .Subscribe(DevicesOnCollectionChanged)
            .AddTo(CompositeDisposable);

        // 定期的にデータを更新する
        DispatcherTimer = new DispatcherTimer
        {
            Interval = RecordingConfig.Default.RefreshRate.Interval
        };
        DispatcherTimer.Tick += Update;
    }

    private CompositeDisposable CompositeDisposable { get; } = new();
    private AudioInterface AudioInterface { get; }

    /// <summary>
    /// すべてのデバイス
    /// </summary>
    public ReadOnlyReactiveCollection<DeviceViewModel> Devices { get; }

    /// <summary>
    /// 計測対象のデバイス
    /// </summary>
    public ObservableCollection<DeviceViewModel> MeasureDevices { get; } = [];

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

    private void DevicesOnCollectionChanged(CollectionChanged<DeviceViewModel> changed)
    {
        switch (changed.Action)
        {
            case NotifyCollectionChangedAction.Add:
            {
                foreach (var device in changed.Values!)
                {
                    device.PropertyChanged += Device_PropertyChanged;

                    // 計測対象外の場合は追加しない
                    if (device.Measure is false) continue;

                    if (MeasureDevices.Contains(device) is false)
                    {
                        MeasureDevices.Add(device);
                    }
                }

                break;
            }
            case NotifyCollectionChangedAction.Remove:
            {
                foreach (var device in changed.Values!)
                {
                    device.PropertyChanged -= Device_PropertyChanged;
                    if (MeasureDevices.Contains(device))
                    {
                        MeasureDevices.Remove(device);
                    }
                }

                break;
            }
            case NotifyCollectionChangedAction.Replace:
                break;
            case NotifyCollectionChangedAction.Move:
                break;
            case NotifyCollectionChangedAction.Reset:
                break;
            default:
                throw new ArgumentOutOfRangeException();
        }
    }

    private void Device_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        // Measureプロパティ以外が変更された場合は無視する
        if (e.PropertyName != nameof(DeviceViewModel.Measure)) return;

        // Measureプロパティが変更された場合はMeasureDevicesに追加または削除する
        var device = (DeviceViewModel)sender!;
        if (device.Measure)
        {
            if (MeasureDevices.Contains(device) is false)
            {
                MeasureDevices.Add(device);
            }
        }
        else
        {
            if (MeasureDevices.Contains(device))
            {
                MeasureDevices.Remove(device);
            }
        }
    }

    /// <summary>
    /// リソースを解放する
    /// </summary>
    public void Dispose()
    {
        CompositeDisposable.Dispose();
    }
}