package expo.modules.termixnet

import android.webkit.CookieManager
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TermixNetModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("TermixNet")

    // Android sends certificates from the shared OkHttp client, so JS keeps
    // using its own fetch, axios and WebSocket.
    Constant("nativeRequests") { false }

    AsyncFunction("importClientCert") { accountId: String, host: String, pfxBase64: String, passphrase: String ->
      try {
        val info = ClientCerts.import(context, accountId, host, pfxBase64, passphrase)
        // Pooled connections were made without the certificate.
        OkHttpClientProvider.getOkHttpClient().connectionPool.evictAll()
        info
      } catch (e: CertException) {
        throw CodedException(e.code, e.message, e)
      }
    }

    AsyncFunction("removeClientCert") { accountId: String ->
      ClientCerts.remove(context, accountId)
      OkHttpClientProvider.getOkHttpClient().connectionPool.evictAll()
    }

    AsyncFunction("hasClientCert") { accountId: String -> ClientCerts.has(accountId) }

    // The web view and React Native share this jar on Android.
    AsyncFunction("readWebCookies") { url: String ->
      val manager = CookieManager.getInstance()
      manager.flush()
      val raw = manager.getCookie(url) ?: return@AsyncFunction emptyList<Map<String, String>>()
      raw.split(";").mapNotNull { part ->
        val index = part.indexOf('=')
        if (index <= 0) {
          null
        } else {
          mapOf("name" to part.substring(0, index).trim(), "value" to part.substring(index + 1).trim())
        }
      }
    }

    AsyncFunction("setCookies") { url: String, cookies: List<Map<String, Any?>> ->
      val manager = CookieManager.getInstance()
      for (cookie in cookies) {
        val name = cookie["name"] as? String ?: continue
        val value = cookie["value"] as? String ?: ""
        val path = cookie["path"] as? String ?: "/"
        manager.setCookie(url, "$name=$value; Path=$path")
      }
      manager.flush()
    }

    AsyncFunction("clearCookie") { url: String, name: String ->
      val manager = CookieManager.getInstance()
      manager.setCookie(url, "$name=; Max-Age=0; Path=/")
      manager.flush()
    }

    AsyncFunction("clearWebCookies") { url: String ->
      val manager = CookieManager.getInstance()
      val raw = manager.getCookie(url) ?: return@AsyncFunction null
      for (part in raw.split(";")) {
        val name = part.substringBefore("=").trim()
        if (name.isNotEmpty()) manager.setCookie(url, "$name=; Max-Age=0; Path=/")
      }
      manager.flush()
      null
    }
  }
}
