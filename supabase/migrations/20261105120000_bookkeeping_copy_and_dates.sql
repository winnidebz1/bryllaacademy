-- Keep the homepage course card in step with the published Bookkeeping description and dates.

update public.courses
set
	short_description = 'An eight-week US bookkeeping training programme, featuring six weeks of intensive bookkeeping instruction, followed by dedicated time for catch-up, practical consolidation, and mentorship. Learn to record financial transactions, work with QuickBooks Online and Xero, reconcile accounts, and manage clients'' books.',
	description = 'An eight-week US bookkeeping training programme, featuring six weeks of intensive bookkeeping instruction, followed by dedicated time for catch-up, practical consolidation, and mentorship. Learn to record financial transactions, work with QuickBooks Online and Xero, reconcile accounts, and manage clients'' books.',
	highlights = array[
		'Debits, credits, and the chart of accounts',
		'QuickBooks Online, accounts payable, and reconciliations',
		'Xero, merchant payouts, and month-end reporting'
	]::text[],
	duration_note = 'Eight weeks, from 4 January 2027 to 1 March 2027',
	cohort_label = '4 January 2027 to 1 March 2027'
where id = 'bookkeeping';
