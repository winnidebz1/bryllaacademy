window.BryllaPublic = {
	supabaseUrl: "https://cwsuxwafjuwxbbhssito.supabase.co",
	supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3c3V4d2FmanV3eGJiaHNzaXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDE2OTYsImV4cCI6MjEwODYxNzY5Nn0.hJQt5NScgzf0yR1GdcqiiyJ4_AzMNUWcfetcf5lo27c",
	client: function () {
		if (!window.supabase || !window.BryllaPublic.supabaseUrl || !window.BryllaPublic.supabaseAnonKey) return null;
		// A saved login used to survive closing the browser. Drop those copies.
		try {
			Object.keys(localStorage).forEach(function (key) {
				if (key.indexOf("sb-") === 0) localStorage.removeItem(key);
			});
		} catch (error) { /* storage can be blocked */ }
		return window.supabase.createClient(window.BryllaPublic.supabaseUrl, window.BryllaPublic.supabaseAnonKey, {
			auth: {
				persistSession: true,
				storage: window.sessionStorage,
				autoRefreshToken: true,
				detectSessionInUrl: true
			}
		});
	}
};
