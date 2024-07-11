using NAudio.Wave;

namespace Spector.Model;

/// <summary>
/// 元音源ストリームをループで再生するためのストリーム。
/// </summary>
/// <remarks>
/// インスタンスを生成する。
/// </remarks>
/// <param name="sourceStream"></param>
public class LoopStream(WaveStream sourceStream) : WaveStream
{
    /// <summary>
    /// WaveFormat
    /// </summary>
    public override WaveFormat WaveFormat => sourceStream.WaveFormat;

    /// <summary>
    /// 音源の長さ
    /// </summary>
    public override long Length => sourceStream.Length;

    /// <summary>
    /// 再生中のポジションを取得・設定する。
    /// </summary>
    public override long Position
    {
        get => sourceStream.Position;
        set => sourceStream.Position = value;
    }

    /// <summary>
    /// 音源を読み取る。
    /// </summary>
    /// <param name="buffer"></param>
    /// <param name="offset"></param>
    /// <param name="count"></param>
    /// <returns></returns>
    public override int Read(byte[] buffer, int offset, int count)
    {
        var totalBytesRead = 0;

        while (totalBytesRead < count)
        {
            var bytesRead = sourceStream.Read(buffer, offset + totalBytesRead, count - totalBytesRead);
            if (bytesRead == 0)
            {
                if (sourceStream.Position == 0)
                {
                    // 元音源に問題がある場合、再生を停止する。
                    break;
                }
                // 末尾まで戻したので先頭に戻す。
                sourceStream.Position = 0;
            }
            totalBytesRead += bytesRead;
        }
        return totalBytesRead;
    }

    /// <summary>
    /// リソースを開放する。
    /// </summary>
    /// <param name="disposing"></param>
    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        sourceStream.Dispose();
    }
}