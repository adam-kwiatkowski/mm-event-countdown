Module.register("mm-event-countdown", {

  defaults: {
    broadcastPastEvents: false,
    selfSignedCert: false,
    excludedEvents: [],
    maximumEntries: 10,
    maximumNumberOfDays: 365,
    pastDaysCount: 0,
    fetchInterval: 60 * 60 * 1000,
    defaultSymbol: "calendar-alt", // Fontawesome Symbol see https://fontawesome.com/cheatsheet?from=io
    defaultSymbolClassName: "fas fa-fw fa-",
    calendars: [
      {
        symbol: "calendar-alt",
        url: "https://www.calendarlabs.com/templates/ical/US-Holidays.ics"
			}
    ]
  },

  requiresVersion: "2.1.0",

	// Define required scripts.
	getStyles () {
		return ["calendar.css", "font-awesome.css"];
	},

	// Define required scripts.
	getScripts () {
		return ["calendarutils.js", "moment.js"];
	},

  /**
   * Pseudo-constructor for our module. Initialize stuff here.
   */
  start() {
    Log.info(`Starting module: ${this.name}`);

    this.templateContent = this.config.exampleContent

    // set timeout for next random text
    setInterval(() => this.addRandomText(), 3000)
  },

  /**
   * Handle notifications received by the node helper.
   * So we can communicate between the node helper and the module.
   *
   * @param {string} notification - The notification identifier.
   * @param {any} payload - The payload data`returned by the node helper.
   */
  socketNotificationReceived: function (notification, payload) {
    if (notification === "EXAMPLE_NOTIFICATION") {
      this.templateContent = `${this.config.exampleContent} ${payload.text}`
      this.updateDom()
    }
  },

  /**
   * Render the page we're on.
   */
  getDom() {
    const wrapper = document.createElement("div")
    wrapper.innerHTML = `<b>Title</b><br />${this.templateContent}`

    return wrapper
  },

  addRandomText() {
    this.sendSocketNotification("GET_RANDOM_TEXT", { amountCharacters: 15 })
  },

  start () {
		Log.info(`Starting module: ${this.name}`);

		// Set locale.
		moment.updateLocale(config.language, CalendarUtils.getLocaleSpecification(config.timeFormat));

		// clear data holder before start
		this.calendarData = {};

		// indicate no data available yet
		this.loaded = false;

		// data holder of calendar url. Avoid fade out/in on updateDom (one for each calendar update)
		this.calendarDisplayer = {};

		this.config.calendars.forEach((calendar) => {
			calendar.url = calendar.url.replace("webcal://", "http://");

			const calendarConfig = {
				maximumEntries: calendar.maximumEntries,
				maximumNumberOfDays: calendar.maximumNumberOfDays,
				pastDaysCount: calendar.pastDaysCount,
				broadcastPastEvents: calendar.broadcastPastEvents,
				selfSignedCert: calendar.selfSignedCert,
				excludedEvents: calendar.excludedEvents,
				fetchInterval: calendar.fetchInterval
			};

			if (typeof calendar.symbolClass === "undefined" || calendar.symbolClass === null) {
				calendarConfig.symbolClass = "";
			}
			if (typeof calendar.titleClass === "undefined" || calendar.titleClass === null) {
				calendarConfig.titleClass = "";
			}
			if (typeof calendar.timeClass === "undefined" || calendar.timeClass === null) {
				calendarConfig.timeClass = "";
			}

			/*
			 * tell helper to start a fetcher for this calendar
			 * fetcher till cycle
			 */
			this.addCalendar(calendar.url, calendar.auth, calendarConfig);
		});

		this.selfUpdate();
	},

  
	// Override socket notification handler.
	socketNotificationReceived (notification, payload) {
		if (notification === "EC_FETCH_CALENDAR") {
			this.sendSocketNotification(notification, { url: payload.url, id: this.identifier });
		}

		if (this.identifier !== payload.id) {
			return;
		}

		if (notification === "EC_CALENDAR_EVENTS") {
			if (this.hasCalendarURL(payload.url)) {
				this.calendarData[payload.url] = payload.events;
				this.error = null;
				this.loaded = true;

				if (this.config.broadcastEvents) {
					this.broadcastEvents();
				}

				if (!this.config.updateOnFetch) {
					if (this.calendarDisplayer[payload.url] === undefined) {
						// calendar will never displayed, so display it
						this.updateDom(this.config.animationSpeed);
						// set this calendar as displayed
						this.calendarDisplayer[payload.url] = true;
					} else {
						Log.debug("[Event countdown] DOM not updated waiting self update()");
					}
					return;
				}
			}
		} else if (notification === "EC_CALENDAR_ERROR") {
			let error_message = this.translate(payload.error_type);
			this.error = this.translate("MODULE_CONFIG_ERROR", { MODULE_NAME: this.name, ERROR: error_message });
			this.loaded = true;
		}

		this.updateDom(this.config.animationSpeed);
	},

	eventEndingWithinNextFullTimeUnit (event, ONE_DAY) {
		const now = new Date();
		return event.endDate - now <= ONE_DAY;
	},

  /**
   * This is the place to receive notifications from other modules or the system.
   *
   * @param {string} notification The notification ID, it is preferred that it prefixes your module name
   * @param {number} payload the payload type.
   */
  notificationReceived(notification, payload) {
    if (notification === "TEMPLATE_RANDOM_TEXT") {
      this.templateContent = `${this.config.exampleContent} ${payload}`
      this.updateDom()
    }
  },

  getDom() {
    const events = this.createEventList(true); // Get the events

    // Return early if no events
    if (events.length === 0) {
        const wrapper = document.createElement("table");
        wrapper.innerHTML = this.loaded ? this.translate("EMPTY") : this.translate("LOADING");
        wrapper.className = "dimmed";
        return wrapper;
    }

    // Use only the first event
    const event = events[0];

    const wrapper = document.createElement("div");

    // Event row
    const eventWrapper = document.createElement("div");
    eventWrapper.className = "event-wrapper normal event";

    // Title
    const titleWrapper = document.createElement("div");
    titleWrapper.className = "title bright";
    titleWrapper.innerHTML = event.title;
    eventWrapper.appendChild(titleWrapper);

    // Time
    const timeWrapper = document.createElement("div");
    timeWrapper.className = "time light";
    const days = this.getDaysUntilEvent(event);
    const s = days > 1 ? 's' : '';
    if (days == 0) {
      timeWrapper.innerHTML = `Today`;
    } else {
      timeWrapper.innerHTML = `In ${days} day${s}`
    }
    eventWrapper.appendChild(timeWrapper);

    wrapper.appendChild(eventWrapper);

    // Location
    if (this.config.showLocation && event.location !== false) {
        const locationRow = document.createElement("tr");
        locationRow.className = "event-wrapper-location normal xsmall light";
        
        const descCell = document.createElement("td");
        descCell.className = "location";
        descCell.colSpan = "2";
        descCell.innerHTML = event.location;
        locationRow.appendChild(descCell);

        wrapper.appendChild(locationRow);
    }

    return wrapper;
},

getDaysUntilEvent(event) {
  const now = new Date();
  const ONE_DAY = 24 * 60 * 60 * 1000; // Milliseconds in a day
  const daysUntilEvent = Math.max(Math.floor((event.startDate - now) / ONE_DAY) + 1, 0);
  return daysUntilEvent;
},

	/**
	 * Checks if this config contains the calendar url.
	 * @param {string} url The calendar url
	 * @returns {boolean} True if the calendar config contains the url, False otherwise
	 */
	hasCalendarURL (url) {
		for (const calendar of this.config.calendars) {
			if (calendar.url === url) {
				return true;
			}
		}

		return false;
	},

  /**
	 * Creates the sorted list of all events.
	 * @param {boolean} limitNumberOfEntries Whether to filter returned events for display.
	 * @returns {object[]} Array with events.
	 */
	createEventList (limitNumberOfEntries) {
		const ONE_SECOND = 1000; // 1,000 milliseconds
		const ONE_MINUTE = ONE_SECOND * 60;
		const ONE_HOUR = ONE_MINUTE * 60;
		const ONE_DAY = ONE_HOUR * 24;

		let now, today, future;
		if (this.config.forceUseCurrentTime || this.defaults.forceUseCurrentTime) {
			now = new Date();
			today = moment().startOf("day");
			future = moment().startOf("day").add(this.config.maximumNumberOfDays, "days").toDate();
		} else {
			now = new Date(Date.now()); // Can use overridden time
			today = moment(now).startOf("day");
			future = moment(now).startOf("day").add(this.config.maximumNumberOfDays, "days").toDate();
		}
		let events = [];

		for (const calendarUrl in this.calendarData) {
			const calendar = this.calendarData[calendarUrl];
			let remainingEntries = this.maximumEntriesForUrl(calendarUrl);
			let maxPastDaysCompare = now - this.maximumPastDaysForUrl(calendarUrl) * ONE_DAY;
			for (const e in calendar) {
				const event = JSON.parse(JSON.stringify(calendar[e])); // clone object
        
				if (limitNumberOfEntries) {
					if (event.endDate < maxPastDaysCompare) {
						continue;
					}
					if (this.config.hideOngoing && event.startDate < now) {
						continue;
					}
					if (this.config.hideDuplicates && this.listContainsEvent(events, event)) {
						continue;
					}
					if (--remainingEntries < 0) {
						break;
					}
				}

				event.url = calendarUrl;
				event.today = event.startDate >= today && event.startDate < today + ONE_DAY;
				event.dayBeforeYesterday = event.startDate >= today - ONE_DAY * 2 && event.startDate < today - ONE_DAY;
				event.yesterday = event.startDate >= today - ONE_DAY && event.startDate < today;
				event.tomorrow = !event.today && event.startDate >= today + ONE_DAY && event.startDate < today + 2 * ONE_DAY;
				event.dayAfterTomorrow = !event.tomorrow && event.startDate >= today + ONE_DAY * 2 && event.startDate < today + 3 * ONE_DAY;

				/*
				 * if sliceMultiDayEvents is set to true, multiday events (events exceeding at least one midnight) are sliced into days,
				 * otherwise, esp. in dateheaders mode it is not clear how long these events are.
				 */
				const maxCount = Math.round((event.endDate - 1 - moment(event.startDate, "x").endOf("day").format("x")) / ONE_DAY) + 1;
				if (this.config.sliceMultiDayEvents && maxCount > 1) {
					const splitEvents = [];
					let midnight
						= moment(event.startDate, "x")
							.clone()
							.startOf("day")
							.add(1, "day")
							.endOf("day")
							.format("x");
					let count = 1;
					while (event.endDate > midnight) {
						const thisEvent = JSON.parse(JSON.stringify(event)); // clone object
						thisEvent.today = thisEvent.startDate >= today && thisEvent.startDate < today + ONE_DAY;
						thisEvent.tomorrow = !thisEvent.today && thisEvent.startDate >= today + ONE_DAY && thisEvent.startDate < today + 2 * ONE_DAY;
						thisEvent.endDate = moment(midnight, "x").clone().subtract(1, "day").format("x");
						thisEvent.title += ` (${count}/${maxCount})`;
						splitEvents.push(thisEvent);

						event.startDate = midnight;
						count += 1;
						midnight = moment(midnight, "x").add(1, "day").endOf("day").format("x"); // next day
					}
					// Last day
					event.title += ` (${count}/${maxCount})`;
					event.today += event.startDate >= today && event.startDate < today + ONE_DAY;
					event.tomorrow = !event.today && event.startDate >= today + ONE_DAY && event.startDate < today + 2 * ONE_DAY;
					splitEvents.push(event);

					for (let splitEvent of splitEvents) {
						if (splitEvent.endDate > now && splitEvent.endDate <= future) {
							events.push(splitEvent);
						}
					}
				} else {
					events.push(event);
				}
			}
		}

		events.sort(function (a, b) {
			return a.startDate - b.startDate;
		});

		if (!limitNumberOfEntries) {
			return events;
		}

		/*
		 * Limit the number of days displayed
		 * If limitDays is set > 0, limit display to that number of days
		 */
		if (this.config.limitDays > 0) {
			let newEvents = [];
			let lastDate = today.clone().subtract(1, "days").format("YYYYMMDD");
			let days = 0;
			for (const ev of events) {
				let eventDate = moment(ev.startDate, "x").format("YYYYMMDD");

				/*
				 * if date of event is later than lastdate
				 * check if we already are showing max unique days
				 */
				if (eventDate > lastDate) {
					// if the only entry in the first day is a full day event that day is not counted as unique
					if (!this.config.limitDaysNeverSkip && newEvents.length === 1 && days === 1 && newEvents[0].fullDayEvent) {
						days--;
					}
					days++;
					if (days > this.config.limitDays) {
						continue;
					} else {
						lastDate = eventDate;
					}
				}
				newEvents.push(ev);
			}
			events = newEvents;
		}

		return events.slice(0, this.config.maximumEntries);
	},

	listContainsEvent (eventList, event) {
		for (const evt of eventList) {
			if (evt.title === event.title && parseInt(evt.startDate) === parseInt(event.startDate) && parseInt(evt.endDate) === parseInt(event.endDate)) {
				return true;
			}
		}
		return false;
	},

  /**
	 * Requests node helper to add calendar url.
	 * @param {string} url The calendar url to add
	 * @param {object} auth The authentication method and credentials
	 * @param {object} calendarConfig The config of the specific calendar
	 */
	addCalendar (url, auth, calendarConfig) {
		this.sendSocketNotification("EC_ADD_CALENDAR", {
			id: this.identifier,
			url: url,
			excludedEvents: calendarConfig.excludedEvents || this.config.excludedEvents,
			maximumEntries: calendarConfig.maximumEntries || this.config.maximumEntries,
			maximumNumberOfDays: calendarConfig.maximumNumberOfDays || this.config.maximumNumberOfDays,
			pastDaysCount: calendarConfig.pastDaysCount || this.config.pastDaysCount,
			fetchInterval: calendarConfig.fetchInterval || this.config.fetchInterval,
			symbolClass: calendarConfig.symbolClass,
			titleClass: calendarConfig.titleClass,
			timeClass: calendarConfig.timeClass,
			auth: auth,
			broadcastPastEvents: calendarConfig.broadcastPastEvents || this.config.broadcastPastEvents,
			selfSignedCert: calendarConfig.selfSignedCert || this.config.selfSignedCert
		});
	},

  /**
	 * Retrieves the symbols for a specific event.
	 * @param {object} event Event to look for.
	 * @returns {string[]} The symbols
	 */
	symbolsForEvent (event) {
		let symbols = this.getCalendarPropertyAsArray(event.url, "symbol", this.config.defaultSymbol);

		if (event.recurringEvent === true && this.hasCalendarProperty(event.url, "recurringSymbol")) {
			symbols = this.mergeUnique(this.getCalendarPropertyAsArray(event.url, "recurringSymbol", this.config.defaultSymbol), symbols);
		}

		if (event.fullDayEvent === true && this.hasCalendarProperty(event.url, "fullDaySymbol")) {
			symbols = this.mergeUnique(this.getCalendarPropertyAsArray(event.url, "fullDaySymbol", this.config.defaultSymbol), symbols);
		}

		return symbols;
	},

	mergeUnique (arr1, arr2) {
		return arr1.concat(
			arr2.filter(function (item) {
				return arr1.indexOf(item) === -1;
			})
		);
	},

	/**
	 * Retrieves the symbolClass for a specific calendar url.
	 * @param {string} url The calendar url
	 * @returns {string} The class to be used for the symbols of the calendar
	 */
	symbolClassForUrl (url) {
		return this.getCalendarProperty(url, "symbolClass", "");
	},

	/**
	 * Retrieves the titleClass for a specific calendar url.
	 * @param {string} url The calendar url
	 * @returns {string} The class to be used for the title of the calendar
	 */
	titleClassForUrl (url) {
		return this.getCalendarProperty(url, "titleClass", "");
	},

	/**
	 * Retrieves the timeClass for a specific calendar url.
	 * @param {string} url The calendar url
	 * @returns {string} The class to be used for the time of the calendar
	 */
	timeClassForUrl (url) {
		return this.getCalendarProperty(url, "timeClass", "");
	},

  /**
	 * Retrieves the calendar name for a specific calendar url.
	 * @param {string} url The calendar url
	 * @returns {string} The name of the calendar
	 */
	calendarNameForUrl (url) {
		return this.getCalendarProperty(url, "name", "");
	},

  /**
	 * Retrieves the color for a specific calendar url.
	 * @param {string} url The calendar url
	 * @param {boolean} isBg Determines if we fetch the bgColor or not
	 * @returns {string} The color
	 */
	colorForUrl (url, isBg) {
		return this.getCalendarProperty(url, isBg ? "bgColor" : "color", "#fff");
	},

	/**
	 * Retrieves the maximum entry count for a specific calendar url.
	 * @param {string} url The calendar url
	 * @returns {number} The maximum entry count
	 */
	maximumEntriesForUrl (url) {
		return this.getCalendarProperty(url, "maximumEntries", this.config.maximumEntries);
	},

	/**
	 * Retrieves the maximum count of past days which events of should be displayed for a specific calendar url.
	 * @param {string} url The calendar url
	 * @returns {number} The maximum past days count
	 */
	maximumPastDaysForUrl (url) {
		return this.getCalendarProperty(url, "pastDaysCount", this.config.pastDaysCount);
	},

  /**
	 * Helper method to retrieve the property for a specific calendar url.
	 * @param {string} url The calendar url
	 * @param {string} property The property to look for
	 * @param {string} defaultValue The value if the property is not found
	 * @returns {*} The property
	 */
	getCalendarProperty (url, property, defaultValue) {
		for (const calendar of this.config.calendars) {
			if (calendar.url === url && calendar.hasOwnProperty(property)) {
				return calendar[property];
			}
		}

		return defaultValue;
	},

	getCalendarPropertyAsArray (url, property, defaultValue) {
		let p = this.getCalendarProperty(url, property, defaultValue);
		if (property === "symbol" || property === "recurringSymbol" || property === "fullDaySymbol") {
			const className = this.getCalendarProperty(url, "symbolClassName", this.config.defaultSymbolClassName);
			p = className + p;
		}

		if (!(p instanceof Array)) p = [p];
		return p;
	},

	hasCalendarProperty (url, property) {
		return !!this.getCalendarProperty(url, property, undefined);
	},

  selfUpdate () {
		const ONE_MINUTE = 60 * 1000;
		setTimeout(
			() => {
				setInterval(() => {
					Log.debug("[Event countdown] self update");
					if (this.config.updateOnFetch) {
						this.updateDom(1);
					} else {
						this.updateDom(this.config.animationSpeed);
					}
				}, ONE_MINUTE);
			},
			ONE_MINUTE - (new Date() % ONE_MINUTE)
		);
	}
})
