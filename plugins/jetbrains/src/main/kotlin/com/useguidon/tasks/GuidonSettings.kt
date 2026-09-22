package com.useguidon.tasks

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.ide.util.PropertiesComponent

/**
 * Application-level (not per-project) settings. The API key lives in the
 * IDE's password safe - the OS keychain by default - never in the project's
 * .idea/ folder, so it can't be committed; base URL, email and the last
 * project are plain application properties.
 *
 * The password safe can be slow (it may talk to the OS keychain), so the key
 * is read once off the EDT by [loadApiKey] and cached; [apiKey] only returns
 * the cached value.
 */
object GuidonSettings {
    private const val PREFIX = "com.useguidon.tasks."
    private val keyAttributes = CredentialAttributes(generateServiceName("Guidon Tasks", "apiKey"))

    @Volatile
    private var cachedApiKey: String? = null

    private val props get() = PropertiesComponent.getInstance()

    var baseUrl: String
        get() = props.getValue(PREFIX + "baseUrl", "https://useguidon.com")
        set(value) = props.setValue(PREFIX + "baseUrl", value.trim())

    var email: String
        get() = props.getValue(PREFIX + "email", "")
        set(value) = props.setValue(PREFIX + "email", value)

    var projectId: String
        get() = props.getValue(PREFIX + "projectId", "")
        set(value) = props.setValue(PREFIX + "projectId", value)

    val apiKey: String get() = cachedApiKey.orEmpty()

    val isLoggedIn: Boolean get() = apiKey.isNotEmpty() && baseUrl.isNotEmpty()

    /** Background thread only. */
    fun loadApiKey() {
        if (cachedApiKey == null) cachedApiKey = PasswordSafe.instance.getPassword(keyAttributes).orEmpty()
    }

    /** Background thread only. Empty clears the stored key. */
    fun storeApiKey(value: String) {
        cachedApiKey = value
        PasswordSafe.instance.setPassword(keyAttributes, value.ifEmpty { null })
    }
}
