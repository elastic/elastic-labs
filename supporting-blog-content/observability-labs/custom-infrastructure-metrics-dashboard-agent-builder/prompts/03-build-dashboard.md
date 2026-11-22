Build a dashboard called "Starlink edge fleet" so the on-call team can see this
without asking:

- At the top, how many sites are reporting and the average drop rate.
- A chart of bad minutes per site, split by likely cause. Our rules: an active dish
  alert means "Dish alert", otherwise obstruction above 1% means "Obstruction",
  otherwise a drop rate above 2% means "Weather".
- Drop rate, obstruction and dish power per site over time.
- A list of the dish alerts that fired, with the site and when.

Open it on the last 2 hours.
