package win.fridayai.dollarq;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// switches the icon of the app on the home screen: one launcher entry (an "activity-alias" in the manifest) per icon, and only one of them is on
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    static final String[] ALIASES = { "IconCity", "IconLego", "IconJapan", "IconSanty", "IconWire", "IconCourt" };

    // name: one of ALIASES (anything else, or nothing: the main icon)
    @PluginMethod
    public void setIcon(PluginCall call) {
        String wanted = call.getString("name", "IconCity");
        boolean known = false;
        for (String a : ALIASES) if (a.equals(wanted)) known = true;
        if (!known) wanted = "IconCity";
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        // the new one goes on first, then the others go off, so the app is never without a launcher entry
        pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + "." + wanted), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (String a : ALIASES) {
            if (a.equals(wanted)) continue;
            pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + "." + a), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
        call.resolve();
    }
}
