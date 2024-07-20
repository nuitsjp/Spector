using System.Diagnostics;
using System.Security.Principal;
using System.Text;

namespace Spector.Model;

public class Firewall
{
    private const string AddFirewall = "--add-firewall";
    private const string RemoveFirewall = "--remove-firewall";
    private const string RuleName = "Spector Remote Connect";

    public static bool IsAdd(string[] args)
    {
        return 0 < args.Length && args[0] == AddFirewall;
    }

    public static bool IsRemove(string[] args)
    {
        return 0 < args.Length && args[0] == RemoveFirewall;
    }

    public static void AddRule()
    {
        if (!IsAdministrator())
        {
            ElevatePrivileges(AddFirewall);
            return;
        }

        // ルールの存在チェック
        var ruleExists = CheckFirewallRuleExists(RuleName);

        if (ruleExists is false)
        {
            AddFirewallRule(RuleName, AudioInterface.RemotePort);
        }
    }

    public static void RemoveRule()
    {
        if (!IsAdministrator())
        {
            ElevatePrivileges(RemoveFirewall);
            return;
        }

        // ルールの存在チェック
        var ruleExists = CheckFirewallRuleExists(RuleName);

        if (ruleExists)
        {
            RemoveFirewallRule(RuleName);
        }
    }

    private static bool CheckFirewallRuleExists(string ruleName)
    {
        var result = RunPowerShellScript(
            $$"""
              $ruleName = '{{ruleName}}'
              $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
              if ($existingRule) {
                  Write-Output 'true'
              } else {
                  Write-Output 'false'
              }
              """);
        return result.Contains("true");
    }

    private static void AddFirewallRule(string ruleName, int port)
    {
        RunPowerShellScript(
            $"""
             $ruleName = '{ruleName}'
             $port = {port}
             New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $port -Protocol TCP -Action Allow
             Write-Output 'ファイアウォールルールを追加しました。'
             """);
    }

    private static void RemoveFirewallRule(string ruleName)
    {
        RunPowerShellScript(
            $"""
             $ruleName = '{ruleName}'
             Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
             Write-Output 'ファイアウォールルールを削除しました。'
             """);
    }

    private static string RunPowerShellScript(string script)
    {
        var base64Script = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -EncodedCommand {base64Script}",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        process.Start();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            throw new Exception(process.StandardError.ReadToEnd());
        }
        return process.StandardOutput.ReadToEnd();
    }

    private static bool IsAdministrator()
    {
        return new WindowsPrincipal(WindowsIdentity.GetCurrent())
            .IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static void ElevatePrivileges(string argument)
    {
        var startInfo = new ProcessStartInfo
        {
            UseShellExecute = true,
            WorkingDirectory = Environment.CurrentDirectory,
            FileName = Process.GetCurrentProcess().MainModule!.FileName,
            Verb = "runas",
            Arguments = argument
        };

        Process.Start(startInfo);
    }
}