using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reactive.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using FluentTextTable;
using Kamishibai;
using NAudio.Wave;
using Reactive.Bindings;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using Spector.Model;

namespace Spector.ViewModel.Analysis;

public partial class AnalysisTabViewModel : ObservableObject, IDisposable
{
    public AnalysisTabViewModel(
        [Inject] IPresentationService presentationService,
        Recorder recorder)
    {
        PresentationService = presentationService;
        Recorder = recorder;
        base.PropertyChanging += OnPropertyChanging;
        PropertyChanged += OnPropertyChanged;

        UpdateRecords();
        recorder.Records.ToCollectionChanged()
            .Subscribe(_ => UpdateRecords())
            .AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.SelectedRecord)
            .Subscribe(x =>
            {
                Devices = x?.RecordByDevices ?? [];
                DeleteRecordCommand.NotifyCanExecuteChanged();
            })
            .AddTo(CompositeDisposable);
    }

    private CompositeDisposable CompositeDisposable { get; } = new();
    private IPresentationService PresentationService { get; }
    private Recorder Recorder { get; }
    [ObservableProperty] private IReadOnlyCollection<RecordViewModel> _records = [];

    [ObservableProperty] private RecordViewModel? _selectedRecord;

    [ObservableProperty] private IReadOnlyCollection<RecordByDeviceViewModel> _devices = [];
    [ObservableProperty] private RecordByDeviceViewModel? _selectedDevice;

    public ObservableCollection<AnalysisDeviceViewModel> AnalysisDevices { get; } = [];

    private void UpdateRecords()
    {
        Records = Recorder.Records
            .Select(record =>
            {
                return new RecordViewModel(
                    record,
                    record.MeasureDeviceId,
                    record.RecordByDevices.SingleOrDefault(x => x.Id == record.MeasureDeviceId)?.Name ??
                    record.MeasureDeviceId.ToString(),
                    record.Direction,
                    record.WithVoice,
                    record.WithBuzz,
                    record.StartTime,
                    record.StopTime,
                    record.RecordByDevices
                        .Select(recordByDevice => new RecordByDeviceViewModel(
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
                        .ToArray());
            })
            .ToArray();
    }

    private void OnPropertyChanging(object? sender, PropertyChangingEventArgs e)
    {
        if (e.PropertyName != nameof(Records)) return;

        foreach (var record in Records)
        {
            foreach (var device in record.RecordByDevices)
            {
                device.PropertyChanged -= DeviceOnPropertyChanged;
            }
        }
        AnalysisDevices.Clear();
    }

    private void OnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(Records)) return;

        foreach (var record in Records)
        {
            foreach (var device in record.RecordByDevices)
            {
                device.PropertyChanged += DeviceOnPropertyChanged;
            }
        }
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
    }
}