package com.abdulrazzaq.forsah;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Strong biometric authorization is bound to each Keystore cryptographic operation. */
@CapacitorPlugin(name = "SessionVault")
public class SessionVaultPlugin extends Plugin {
    private static final String ALIAS = "forsah.session.v1";
    private boolean authenticating = false;
    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("forsah-vault", Context.MODE_PRIVATE);
    }
    // Persistent, encrypted login independent of the optional biometric lock.
    private SecretKey persistentKey() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        String alias="forsah.persistent.v1";
        if(!store.containsAlias(alias)) {
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(alias,null);
    }
    @PluginMethod public void persist(PluginCall call) {
        try {
            String token=call.getString("token","");
            SharedPreferences storage=getContext().getSharedPreferences("forsah-persistent",Context.MODE_PRIVATE);
            if(token.isEmpty()) { if(!storage.edit().clear().commit()) throw new Exception("Storage failed"); }
            else {
                if(!token.matches("[A-Za-z0-9_-]{40,256}")) throw new Exception("Invalid token");
                Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,persistentKey());
                if(!storage.edit().putString("data",Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP))
                    .putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).commit()) throw new Exception("Storage failed");
            }
            call.resolve();
        } catch(Exception e) { call.reject("Cannot save session",e); }
    }
    @PluginMethod public void restore(PluginCall call) {
        try {
            SharedPreferences storage=getContext().getSharedPreferences("forsah-persistent",Context.MODE_PRIVATE);
            String token="";
            if(storage.contains("data")) {
                Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE,persistentKey(),new GCMParameterSpec(128,Base64.decode(storage.getString("iv",""),Base64.NO_WRAP)));
                token=new String(cipher.doFinal(Base64.decode(storage.getString("data",""),Base64.NO_WRAP)),StandardCharsets.UTF_8);
            }
            JSObject result=new JSObject();result.put("token",token);call.resolve(result);
        } catch(Exception e) { call.reject("Cannot restore session",e); }
    }
    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("saved", prefs().contains("ciphertext"));
        call.resolve(result);
    }
    @PluginMethod
    public void clear(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (authenticating) { call.reject("Biometric operation in progress"); return; }
            try {
                prefs().edit().clear().commit();
                KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
                store.deleteEntry(ALIAS); call.resolve();
            } catch (Exception error) { call.reject("Cannot clear encrypted session", error); }
        });
    }
    @PluginMethod
    public void save(PluginCall call) {
        String token = call.getString("token");
        if (token == null || !token.matches("[A-Za-z0-9_-]{40,256}")) { call.reject("Invalid session token"); return; }
        authenticate(call, token);
    }
    @PluginMethod
    public void unlock(PluginCall call) { authenticate(call, null); }
    private void authenticate(PluginCall call, String token) {
        getActivity().runOnUiThread(() -> {
            if (authenticating) { call.reject("Biometric operation in progress"); return; }
            try {
                if (BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) != BiometricManager.BIOMETRIC_SUCCESS) {
                    call.reject("Strong biometric enrollment required"); return;
                }
                KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
                if (token == null && (!store.containsAlias(ALIAS) || !prefs().contains("ciphertext"))) { call.reject("No encrypted session. Sign in with your password."); return; }
                if (!store.containsAlias(ALIAS)) {
                    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                    generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true).build());
                    generator.generateKey();
                }
                SecretKey key = (SecretKey) store.getKey(ALIAS, null);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                if (token != null) cipher.init(Cipher.ENCRYPT_MODE, key);
                else cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(prefs().getString("iv", ""), Base64.NO_WRAP)));
                authenticating = true;
                BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationError(int code, CharSequence message) {
                        authenticating = false; call.reject(message.toString());
                    }
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        authenticating = false;
                        try {
                            Cipher authenticated = result.getCryptoObject() == null ? null : result.getCryptoObject().getCipher();
                            if (authenticated == null) { call.reject("Missing authenticated cipher"); return; }
                            if (token != null) {
                                byte[] encrypted = authenticated.doFinal(token.getBytes(StandardCharsets.UTF_8));
                                boolean saved = prefs().edit().putString("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                                    .putString("iv", Base64.encodeToString(authenticated.getIV(), Base64.NO_WRAP)).commit();
                                if (!saved) { call.reject("Cannot persist encrypted session"); return; }
                                call.resolve();
                            } else {
                                byte[] decoded = authenticated.doFinal(Base64.decode(prefs().getString("ciphertext", ""), Base64.NO_WRAP));
                                JSObject response = new JSObject(); response.put("token", new String(decoded, StandardCharsets.UTF_8)); call.resolve(response);
                            }
                        } catch (Exception error) { call.reject("Session cannot be decrypted. Clear it and sign in again.", error); }
                    }
                });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Forsah / فرصة").setSubtitle("Unlock encrypted session / فتح الجلسة المشفرة")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButtonText("Cancel / إلغاء").build();
                prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
            } catch (Exception error) { authenticating = false; call.reject("Biometric key unavailable. Clear saved session and sign in again.", error); }
        });
    }
}
