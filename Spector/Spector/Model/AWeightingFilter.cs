using NAudio.Dsp;
using NAudio.Wave;

namespace Spector.Model;

public class AWeightingFilter : ISampleProvider
{
    private readonly ISampleProvider _source;
    private readonly BiQuadFilter[] _filters;

    public AWeightingFilter(ISampleProvider source)
    {
        _source = source;
        _filters = DesignAWeightingFilters(source.WaveFormat.SampleRate);
    }

    private BiQuadFilter[] DesignAWeightingFilters(int sampleRate)
    {
        // A特性フィルターの設計（IEC 61672:2003規格に基づく）
        float f1 = 20.598997f;
        float f2 = 107.65265f;
        float f3 = 737.86223f;
        float f4 = 12194.217f;

        // サンプリングレートに基づいてフィルターの周波数を調整
        float nyquist = sampleRate / 2f;
        f1 = Math.Min(f1, nyquist * 0.8f);
        f2 = Math.Min(f2, nyquist * 0.8f);
        f3 = Math.Min(f3, nyquist * 0.8f);
        f4 = Math.Min(f4, nyquist * 0.8f);

        return new BiQuadFilter[]
        {
            BiQuadFilter.HighPassFilter(sampleRate, f1, 0.5f),
            BiQuadFilter.HighPassFilter(sampleRate, f1, 0.5f),
            BiQuadFilter.LowPassFilter(sampleRate, f4, 0.5f),
            BiQuadFilter.LowPassFilter(sampleRate, f4, 0.5f),
            BiQuadFilter.PeakingEQ(sampleRate, (float)Math.Sqrt(f2 * f3), 0.5f, 3.0f)
        };
    }

    public int Read(float[] buffer, int offset, int count)
    {
        int samplesRead = _source.Read(buffer, offset, count);
        for (int i = 0; i < samplesRead; i++)
        {
            float sample = buffer[offset + i];
            foreach (var filter in _filters)
            {
                sample = filter.Transform(sample);
                if (float.IsNaN(sample) || float.IsInfinity(sample))
                {
                    sample = 0f; // NaNやInfinityが検出された場合、サンプルを0に設定
                }
            }
            buffer[offset + i] = Math.Max(-1f, Math.Min(1f, sample)); // サンプルを-1から1の範囲にクランプ
        }
        return samplesRead;
    }

    public WaveFormat WaveFormat => _source.WaveFormat;
}