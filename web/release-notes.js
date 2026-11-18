window.RELEASE_NOTES=Object.freeze([
  Object.freeze({version:"0.64",date:"18 November 2026",time:"18:59 GMT",changes:[
    "Camera scans wait for three matching reads before a barcode is used, as in the Android app. The status shows 'Attempting scan twice' and then 'Attempting scan thrice' while it reads.",
    "A camera scan that finds no product is tried again, up to three scans. If nothing is found, the status says so and suggests checking the barcode or searching by name.",
    "On phones 400 px wide or less, the search field drops its magnifier so “Barcode or name” fits in full. The arrow still runs the search.",
    "On iPhone, Add to Home Screen uses the app’s own icon and opens the app full screen."
  ]}),
  Object.freeze({version:"0.63",date:"25 October 2026",time:"10:50 GMT",changes:[
    "Plan comments sit in one section beside each plan, with the note box and recent comments always visible. The separate comment page is gone, and comments stay on this device.",
    "The product and placement count moves to the end of the results instead of the top status row.",
    "Buttons use a light tint with softer outlines, and the search bar stays in place on Settings, What’s new and history pages.",
    "The search field and scan button share one height, with smaller gaps across the top bar.",
    "Result details and history use thin separator lines; Photo, Item details, Location notes and History keep their outlines."
  ]}),
  Object.freeze({version:"0.62",date:"24 October 2026",time:"20:02 BST",changes:[
    "The app menu has Go back and Go forward actions for the page history.",
    "Every button shows an icon from one shared set, including Paste text, Paste image, Upload image and the Back controls.",
    "What’s new, the app menu and result rows use thin separator lines instead of boxed borders.",
    "Warnings start with an icon, so the reason is visible at a glance."
  ]}),
  Object.freeze({version:"0.61",date:"23 October 2026",time:"21:00 BST",changes:[
    "History now includes a Go forward action, and the app menu shows the release date.",
    "What’s new has its own screen with compact divider lines; Settings shows the version date and time.",
    "Search paste and image-upload actions now have icons and consistent touch-sized buttons."
  ]}),
  Object.freeze({version:"0.60",date:"23 October 2026",changes:[
    "The scan button is wider at phone size, with less empty edge space around the search bar.",
    "The small-screen scan control stays compact so search remains usable."
  ]}),
  Object.freeze({version:"0.59",date:"23 October 2026",changes:[
    "Plan comments and status notes now appear beside the plan, including a clear local-only empty state.",
    "Product and placement counts no longer take up the top status row on a matched item."
  ]}),  Object.freeze({version:"0.58",date:"23 October 2026",changes:[
    "Click & Collect now shows whether the store check is waiting, failed, available or out of date.",
    "A failed refresh keeps the last successful collection result visible with its original age."
  ]}),
  Object.freeze({version:"0.57",date:"23 October 2026",changes:[
    "Back closes an open dialog before leaving the Settings screen."
  ]}),
  Object.freeze({version:"0.56",date:"23 October 2026",changes:[
    "Settings opens as its own screen with a clear Back action, and the App menu shows the version.",
    "Plan and item actions are easier to spot; repeated item/plan labels are reduced and the scan control is wider."
  ]}),
  Object.freeze({version:"0.55",date:"23 October 2026",changes:[
    "Settings sections now have clear line icons and lightweight separators.",
    "Tighter spacing and a slightly larger scan button make common actions easier to reach."
  ]}),
  Object.freeze({version:"0.54",date:"22 October 2026",changes:[
    "The department/source name for a plan is now visible below its diagram in a cleaner form."
  ]}),
  Object.freeze({version:"0.53",date:"22 October 2026",changes:[
    "Read recent version updates from What’s new in the app menu or Settings. Notes work offline."
  ]}),
  Object.freeze({version:"0.52",date:"22 October 2026",changes:[
    "Quick-action labels stay visible while you keep holding, then hide when you release.",
    "After a scan, optional item details and label capture are easier to find."
  ]}),
  Object.freeze({version:"0.51",date:"22 October 2026",changes:[
    "Dunelm refresh details explain which price, collection or delivery check failed and when it can retry.",
    "A previous successful price and availability snapshot is kept when a refresh fails."
  ]})
]);
