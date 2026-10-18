window.BryllaPublic = {
	supabaseUrl: "https://pfcnbenzpezttqtsvvom.supabase.co",
	supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmY25iZW56cGV6dHRxdHN2dm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NDIyOTEsImV4cCI6MjEwNzQxODI5MX0.Pg3BuW8mqek4nxHkoVKi93oUHT6UfI28wsDAbkhrWX4",
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
