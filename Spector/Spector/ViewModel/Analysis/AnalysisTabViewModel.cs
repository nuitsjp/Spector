using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using FluentTextTable;
using Kamishibai;
using Reactive.Bindings;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using Spector.Model;
using Spector.View.Measure;
using Recorder = Spector.Model.Recorder;

namespace Spector.ViewModel.Analysis;

public partial class AnalysisTabViewModel : ObservableObject, IDisposable
{
    public AnalysisTabViewModel(
        [Inject] IPresentationService presentationService,
        Model.Recorder recorder)
    {
        PresentationService = presentationService;
        Recorder = recorder;

        Records.CollectionChanged += RecordsOnCollectionChanged;

        UpdateRecords();
        recorder.Records.ToCollectionChanged()
            .Subscribe(_ => UpdateRecords())
            .AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.SelectedRecord)
            .Subscribe(x =>
            {
                Processes = x?.RecordProcesses ?? [];
                DeleteRecordCommand.NotifyCanExecuteChanged();
            })
            .AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.SelectedProcess)
            .Subscribe(x =>
            {
                Devices = x?.RecordByDevices ?? [];
                DeleteRecordCommand.NotifyCanExecuteChanged();
            })
            .AddTo(CompositeDisposable);
    }

    private void RecordsOnCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (e.NewItems is not null)
        {
            foreach (RecordViewModel record in e.NewItems)
            {
                foreach (var device in record.RecordProcesses.SelectMany(x => x.RecordByDevices))
                {
                    device.PropertyChanged += DeviceOnPropertyChanged;
                }
            }
        }

        if (e.OldItems is not null)
        {
            foreach (RecordViewModel record in e.OldItems)
            {
                foreach (var device in record.RecordProcesses.SelectMany(x => x.RecordByDevices))
                {
                    device.PropertyChanged -= DeviceOnPropertyChanged;
                }
            }
        }
    }

    private CompositeDisposable CompositeDisposable { get; } = [];
    private IPresentationService PresentationService { get; }
    private Recorder Recorder { get; }
    public ReactiveCollection<RecordViewModel> Records { get; } = [];

    [ObservableProperty] private RecordViewModel? _selectedRecord;
    [ObservableProperty] private IReadOnlyList<RecordProcessViewModel> _processes = [];
    [ObservableProperty] private RecordProcessViewModel? _selectedProcess;

    [ObservableProperty] private IReadOnlyCollection<RecordByDeviceViewModel> _devices = [];
    [ObservableProperty] private RecordByDeviceViewModel? _selectedDevice;

    public ObservableCollection<AnalysisDeviceViewModel> AnalysisDevices { get; } = [];

    private void UpdateRecords()
    {
        Records.Clear();

        Recorder.Records
            .Select(record =>
            {
                return new RecordViewModel(
                    record,
                    record.MeasureDeviceId,
                    record.RecordProcesses
                        .SelectMany(x => x.RecordByDevices)
                        .FirstOrDefault(x => x.Id == record.MeasureDeviceId)?
                        .Name 
                    ?? record.MeasureDeviceId.ToString(),
                    record.StartTime,
                    record.StopTime,
                    record
                        .RecordProcesses
                        .Select(x => new RecordProcessViewModel(
                            x.Direction,
                            x.WithVoice,
                            x.WithBuzz,
                            x.VolumeLevel,
                            x.RecordByDevices.Select(recordByDevice => new RecordByDeviceViewModel(
                                    recordByDevice,
                                    recordByDevice.Id,
                                    recordByDevice.Name,
                                    recordByDevice.SystemName,
                                    recordByDevice.Min,
                                    recordByDevice.Avg,
                                    recordByDevice.Max,
                                    recordByDevice.Minus30db,
                                    recordByDevice.Minus40db,
                                    recordByDevice.Minus50db))
                                .ToArray()
                        )).ToArray());
            })
            .ToList()
            .ForEach(x => Records.Add(x));
    }

    private void DeviceOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(RecordByDeviceViewModel.IsAnalysis)) return;

        var device = (RecordByDeviceViewModel)sender!;
        if (device.IsAnalysis)
        {
            // IsAnalysisがtrueになった場合、外套のDeviceが存在するRecordは必ずSelectedRecordになっている
            var inputLevels = Recorder.AnalyzeWaveFile(SelectedRecord!.Record, device.Device);
            AnalysisDevices.Add(
                new AnalysisDeviceViewModel(
                    SelectedRecord!, 
                    SelectedProcess!,
                    device, 
                    inputLevels.ToArray()));
        }
        else
        {
            AnalysisDevices.Remove(AnalysisDevices.Single(x => x.DeviceRecord == device));
        }
    }

    private bool CanDeleteRecord() => SelectedRecord is not null;

    [RelayCommand(CanExecute = nameof(CanDeleteRecord))]
    private void DeleteRecord(RecordViewModel? recordViewModel)
    {
        // チェックとすれ違いでイベントが発行する可能性があるため、nullチェックを行う。
        if(recordViewModel is null) return;

        Recorder.DeleteRecord(recordViewModel.Record);
    }

    [RelayCommand]
    private async Task SaveRecordAsync(IPlot plot)
    {
        var context = new SaveFileDialogContext()
        {
            Title = "分析結果ファイルを指定してください",
            DefaultFileName = $"{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.md"
        };
        context.Filters.Add(new FileDialogFilter("Markdown", "md"));
        if (PresentationService.SaveFile(context) == DialogResult.Ok)
        {
            var file = new FileInfo(context.FileName);

            // 拡張子を除いたファイル名を取得
            var fileName = Path.GetFileNameWithoutExtension(file.Name);
            // プロットを画像に変換して保存
            using var bitmap = plot.Render();
            var bitmapFileName = $"{fileName}.png";
            bitmap.Save(Path.Combine(file.DirectoryName!, bitmapFileName), ImageFormat.Png);


            // マークダウンファイルを作成
            await using var writer = new StreamWriter(file.FullName);
            Build
                .MarkdownTable<AnalysisDeviceViewModel>(builder =>
                {
                    builder
                        .Columns.Add(x => x.Device)
                        .Columns.Add(x => x.Direction)
                        .Columns.Add(x => x.WithBuzz)
                        .Columns.Add(x => x.WithVoice)
                        .Columns.Add(x => x.Min).FormatAs("{0:0.000}")
                        .Columns.Add(x => x.Avg).FormatAs("{0:0.000}")
                        .Columns.Add(x => x.Max).FormatAs("{0:0.000}")
                        .Columns.Add(x => x.Minus30db).FormatAs("{0:0.000}")
                        .Columns.Add(x => x.Minus40db).FormatAs("{0:0.000}")
                        .Columns.Add(x => x.Minus50db).FormatAs("{0:0.000}");
                })
                .Write(writer, AnalysisDevices);

            await writer.WriteLineAsync();
            await writer.WriteAsync($"![]({bitmapFileName})");
            await writer.FlushAsync();

        }
    }

    public void Dispose()
    {
        CompositeDisposable.Dispose();
        GC.SuppressFinalize(this);
    }
}