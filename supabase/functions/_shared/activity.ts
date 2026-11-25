import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type ActivityInput = {
	event_type: string;
	category: string;
	action: string;
	description?: string;
	actor_id?: string | null;
	actor_name?: string | null;
	actor_email?: string | null;
	actor_role?: "Student" | "Instructor" | "Admin" | "Anonymous" | "System";
	target_type?: string | null;
	target_id?: string | null;
	target_name?: string | null;
	metadata?: Record<string, unknown>;
	previous_values?: Record<string, unknown> | null;
	new_values?: Record<string, unknown> | null;
	status?: "Success" | "Failed" | "Pending" | "Warning";
	severity?: "Info" | "Warning" | "Error" | "Critical";
	session_id?: string | null;
	request_id?: string | null;
};

export async function logActivity(supabase: SupabaseClient, input: ActivityInput): Promise<void> {
	try {
		const metadata = { ...(input.metadata || {}) } as Record<string, unknown>;
		["password", "token", "access_token", "refresh_token", "authorization", "api_key", "secret", "card", "cvv", "otp", "code"].forEach(function (key) {
			delete metadata[key];
		});
		await supabase.from("activity_logs").insert({
			event_type: input.event_type,
			category: input.category,
			action: input.action,
			description: (input.description || "").slice(0, 2000),
			actor_id: input.actor_id || null,
			actor_name: input.actor_name || null,
			actor_email: input.actor_email || null,
			actor_role: input.actor_role || "System",
			target_type: input.target_type || null,
			target_id: input.target_id || null,
			target_name: input.target_name || null,
			metadata: metadata,
			previous_values: input.previous_values || null,
			new_values: input.new_values || null,
			status: input.status || "Success",
			severity: input.severity || "Info",
			session_id: input.session_id || null,
			request_id: input.request_id || null,
		});
	} catch (_error) {
		// Non-critical logging must not break business flows.
	}
}
