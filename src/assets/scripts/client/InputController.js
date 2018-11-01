/* eslint-disable camelcase, no-mixed-operators, object-shorthand, no-undef, expected-return*/
import $ from 'jquery';
import _has from 'lodash/has';
import _includes from 'lodash/includes';
import AirportController from './airport/AirportController';
import CanvasStageModel from './canvas/CanvasStageModel';
import EventBus from './lib/EventBus';
import GameController from './game/GameController';
import UiController from './UiController';
import AircraftCommandParser from './parsers/aircraftCommandParser/AircraftCommandParser';
import ScopeCommandModel from './parsers/scopeCommandParser/ScopeCommandModel';
import { clamp } from './math/core';
import { EVENT } from './constants/eventNames';
import { GAME_OPTION_NAMES } from './constants/gameOptionConstants';
import { INVALID_NUMBER } from './constants/globalConstants';
import {
    COMMAND_CONTEXT,
    KEY_CODES,
    MOUSE_EVENT_CODE,
    PARSED_COMMAND_NAME
} from './constants/inputConstants';
import { SELECTORS } from './constants/selectors';

// Temporary const declaration here to attach to the window AND use as internal propert
const input = {};

/**
 * @class InputController
 */
export default class InputController {
    /**
     * @constructor
     * @param $element {JQuery|HTML Element}
     * @param aircraftCommander {AircraftCommander}
     * @param scopeModel {ScopeModel}
     * @param tutorialView {TutorialView}
     */
    constructor($element, aircraftCommander, aircraftController, scopeModel, tutorialView) {
        this.$element = $element;
        this.$body = null;
        this.$window = null;
        this.$commandInput = null;
        this.$canvases = null;

        this._eventBus = EventBus;
        this._aircraftCommander = aircraftCommander;
        this._aircraftController = aircraftController;
        this._scopeModel = scopeModel;
        this._tutorialView = tutorialView;


        prop.input = input;
        this.input = input;
        this.input.command = '';
        this.input.callsign = '';
        this.input.data = '';
        this.input.history = [];
        this.input.history_item = null;
        this.input.click = [0, 0];
        this._mouseDelta = [0, 0];
        this._mouseDownScreenPosition = [0, 0];
        this.input.isMouseDown = false;
        this.commandBarContext = COMMAND_CONTEXT.AIRCRAFT;

        this._init();
    }

    /**
     * @for InputController
     * @method _init
     */
    _init() {
        this.$body = this.$element[0];
        this.$window = $(window);
        this.$commandInput = this.$element.find(SELECTORS.DOM_SELECTORS.COMMAND);
        this.$canvases = this.$element.find(SELECTORS.DOM_SELECTORS.CANVASES);

        return this.setupHandlers().enable();
    }

    /**
     * @for InputController
     * @method setupHandlers
     */
    setupHandlers() {
        this.onKeydownHandler = this._onKeydown.bind(this);
        this.onCommandInputChangeHandler = this._onCommandInputChange.bind(this);
        this.onMouseScrollHandler = this._onMouseScroll.bind(this);
        this.onMouseClickAndDragHandler = this._onMouseClickAndDrag.bind(this);
        this.onMouseUpHandler = this._onMouseUp.bind(this);
        this.onMouseDownHandler = this._onMouseDown.bind(this);

        return this;
    }

    /**
     * Enable all event handlers
     *
     * @for InputController
     * @method enable
     */
    enable() {
        this.$window.on('keydown', this.onKeydownHandler);
        this.$commandInput.on('input', this.onCommandInputChangeHandler);
        // TODO: these are non-standard events and will be deprecated soon. this should be moved
        // over to the `wheel` event. This should also be moved over to `.on()` instead of `.bind()`
        // https://developer.mozilla.org/en-US/docs/Web/Events/wheel
        // this.$commandInput.on('DOMMouseScroll mousewheel', this.onMouseScrollHandler);
        this.$canvases.bind('DOMMouseScroll mousewheel', this.onMouseScrollHandler);
        this.$canvases.on('mousemove', this.onMouseClickAndDragHandler);
        this.$canvases.on('mouseup', this.onMouseUpHandler);
        this.$canvases.on('mousedown', this.onMouseDownHandler);
        this.$body.addEventListener('contextmenu', (event) => event.preventDefault());

        // TODO: Fix this
        this._eventBus.on(EVENT.STRIP_CLICK, this.selectAircraftByCallsign);

        return this;
    }

    /**
     * Disable all event handlers and destroy the instance
     *
     * @for InputController
     * @method disable
     */
    disable() {
        this.$window.off('keydown', this.onKeydownHandler);
        this.$commandInput.off('input', this.onCommandInputChangeHandler);
        // uncomment only after `.on()` for this event has been implemented.
        // this.$commandInput.off('DOMMouseScroll mousewheel', this.onMouseScrollHandler);
        this.$canvases.off('mousemove', this.onMouseClickAndDragHandler);
        this.$canvases.off('mouseup', this.onMouseUpHandler);
        this.$canvases.off('mousedown', this.onMouseDownHandler);
        this.$body.removeEventListener('contextmenu', event.preventDefault());

        this._eventBus.off(EVENT.STRIP_CLICK, this.selectAircraftByCallsign);

        return this.destroy();
    }

    /**
     * @for InputController
     * @method destroy
     */
    destroy() {
        this.$element = null;
        this.$body = null;
        this.$window = null;
        this.$commandInput = null;
        this.$canvases = null;

        this.input = input;
        this.input.command = '';
        this.input.callsign = '';
        // this.input.data = '';
        this.input.history = [];
        this.input.history_item = null;
        this.input.click = [0, 0];
        this._mouseDelta = [0, 0];
        this._mouseDownScreenPosition = [0, 0];
        this.input.isMouseDown = false;

        return this;
    }

    /**
     * @for InputController
     * @method input_init_pre
     */
    input_init_pre() {
        // TODO: these prop properties can be removed except for `this.input`
        this.input = input;
        this.input.command = '';
        this.input.callsign = '';
        this.input.data = '';
        this.input.history = [];
        this.input.history_item = null;
        this.input.click = [0, 0];
        this._mouseDelta = [0, 0];
        this._mouseDownScreenPosition = [0, 0];
        this.input.isMouseDown = false;
    }

    // TODO: The tutorial should be moved to the UiController, and then this can be removed
    /**
     * Close all open dialogs and return focus to the command bar
     *
     * @for InputController
     * @method closeAllDialogs
     */
    closeAllDialogs() {
        if (prop.tutorial.open) {
            this._tutorialView.tutorial_close();
        }

        UiController.closeAllDialogs();
    }

    /**
     * De-selects any selected aircraft
     *
     * This clears the current aircraft callsign from the command input
     * and de-selects an active aircraft's:
     * - flight strip
     * - radar target
     *
     * @for InputController
     * @method deselectAircraft
     */
    deselectAircraft() {
        // TODO: Refactor out the prop
        // using `prop` here so CanvasController knows which aircraft is selected
        prop.input.callsign = '';
        prop.input.command = '';
        this.input.callsign = '';
        this.input.command = '';
        this.$commandInput.val('');

        this._eventBus.trigger(EVENT.DESELECT_ACTIVE_STRIP_VIEW, {});
    }

    /**
     * @for InputController
     * @method _onMouseScroll
     * @param event {jquery Event}
     */
    _onMouseScroll(event) {
        if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0) {
            CanvasStageModel.zoomIn();

            return;
        }

        CanvasStageModel.zoomOut();
    }

    /**
     * @for InputController
     * @method _onMouseClickAndDrag
     * @param event {jquery Event}
     */
    _onMouseClickAndDrag(event) {
        if (!this.input.isMouseDown) {
            return this;
        }

        const nextXPan = event.pageX - this._mouseDownScreenPosition[0];
        const nextYPan = event.pageY - this._mouseDownScreenPosition[1];

        // TODO: investigate `_mouseDelta` and what exactly it does
        // this updates the current mouseDelta so the next time through we have correct values
        this._mouseDelta = [
            nextXPan,
            nextYPan
        ];

        CanvasStageModel.updatePan(nextXPan, nextYPan);
    }

    /**
     * @for InputController
     * @method _onMouseUp
     * @param event {jquery Event}
     */
    _onMouseUp(event) {
        this.input.isMouseDown = false;
    }

    /**
     * @for InputController
     * @method _onMouseDown
     * @param event {jquery Event}
     */
    _onMouseDown(event) {
        event.preventDefault();

        switch (event.which) {
            case MOUSE_EVENT_CODE.LEFT_PRESS:
                this._onLeftMouseButtonPress(event);

                break;
            case MOUSE_EVENT_CODE.MIDDLE_PRESS:
                CanvasStageModel.zoomReset();

                break;
            case MOUSE_EVENT_CODE.RIGHT_PRESS:
                this._onRightMousePress(event);

                break;
            default:
                break;
        }
    }

    /**
     * @for InputController
     * @method _onCommandInputChange
     * @private
     */
    _onCommandInputChange() {
        this.input.command = this.$commandInput.val();
    }

    /**
     * @for InputController
     * @method selectAircraft
     * @param aircraftModel {AircraftModel}
     */
    selectAircraft = (aircraftModel) => {
        if (!aircraftModel || !aircraftModel.isControllable) {
            this.deselectAircraft();

            return;
        }

        // TODO: Refactor out the prop
        // using `prop` here so CanvasController knows which aircraft is selected
        prop.input.callsign = aircraftModel.callsign;
        prop.input.command = '';
        this.input.callsign = aircraftModel.callsign;
        this.input.command = '';
        this.$commandInput.val(`${aircraftModel.callsign} `);
        this._eventBus.trigger(EVENT.SELECT_STRIP_VIEW_FROM_DATA_BLOCK, aircraftModel);
    };

    /**
     * Select aircraft by callsign
     *
     * @for InputController
     * @method selectAircraftByCallsign
     * @param callsign {string}
     */
    selectAircraftByCallsign = (callsign) => {
        const aircraftModel = this._aircraftController.findAircraftByCallsign(callsign);

        this.selectAircraft(aircraftModel);
    }

    /**
     * @for InputController
     * @method _onKeydown
     * @param event {jquery Event}
     * @private
     */
    _onKeydown(event) {
        const currentCommandInputValue = this.$commandInput.val();

        // TODO: this swtich can be simplified, there is a lot of repetition here
        switch (event.which) {
            case KEY_CODES.BAT_TICK:
                this.$commandInput.val(`${currentCommandInputValue}\` `);
                event.preventDefault();
                this.onCommandInputChangeHandler();

                break;
            case KEY_CODES.ENTER:
                this.processCommand();

                break;
            case KEY_CODES.PAGE_UP:
                this.selectPreviousAircraft();
                event.preventDefault();

                break;
            case KEY_CODES.PAGE_DOWN:
                this.selectNextAircraft();
                event.preventDefault();

                break;
            case KEY_CODES.LEFT_ARROW:
                if (this._isArrowControlMethod()) {
                    this.$commandInput.val(`${currentCommandInputValue} t l `);
                    event.preventDefault();
                    this.onCommandInputChangeHandler();
                }

                break;
            case KEY_CODES.UP_ARROW:
                if (this._isArrowControlMethod()) {
                    this.$commandInput.val(`${currentCommandInputValue} c `);
                    event.preventDefault();
                    this.onCommandInputChangeHandler();
                } else {
                    this.selectPreviousAircraft();
                    event.preventDefault();
                }

                break;
            case KEY_CODES.RIGHT_ARROW:
                if (this._isArrowControlMethod()) {
                    this.$commandInput.val(`${currentCommandInputValue} t r `);
                    event.preventDefault();
                    this.onCommandInputChangeHandler();
                }

                break;
            case KEY_CODES.DOWN_ARROW:
                if (this._isArrowControlMethod()) {
                    this.$commandInput.val(`${currentCommandInputValue} d `);
                    event.preventDefault();
                    this.onCommandInputChangeHandler();
                } else {
                    this.selectPreviousAircraft();
                    event.preventDefault();
                }

                break;
            case KEY_CODES.MULTIPLY:
                this.$commandInput.val(`${currentCommandInputValue} * `);
                event.preventDefault();
                this.onCommandInputChangeHandler();

                break;
            case KEY_CODES.ADD:
                this.$commandInput.val(`${currentCommandInputValue} + `);
                event.preventDefault();
                this.onCommandInputChangeHandler();

                break;
            case KEY_CODES.EQUALS: // mac + (actually `=`)
                this.$commandInput.val(`${currentCommandInputValue} + `);
                event.preventDefault();
                this.onCommandInputChangeHandler();

                break;
            case KEY_CODES.SUBTRACT:
                this.$commandInput.val(`${currentCommandInputValue} - `);
                event.preventDefault();
                this.onCommandInputChangeHandler();

                break;
            case KEY_CODES.DASH: // mac -
                this.$commandInput.val(`${currentCommandInputValue} - `);
                event.preventDefault();
                this.onCommandInputChangeHandler();

                break;
            case KEY_CODES.DIVIDE:
                this.$commandInput.val(`${currentCommandInputValue} takeoff `);
                event.preventDefault();
                this.onCommandInputChangeHandler();

                break;
            case KEY_CODES.TAB:
                this.$commandInput.val('');
                event.preventDefault();
                this._toggleCommandBarContext();

                break;
            case KEY_CODES.ESCAPE: {
                this.closeAllDialogs();

                const hasCallsign = _includes(currentCommandInputValue, this.input.callsign);
                const hasOnlyCallsign = currentCommandInputValue.trim() === this.input.callsign;
                const hasSelectedCallsign = this.input.callsign !== '';

                if (!hasCallsign || hasOnlyCallsign || !hasSelectedCallsign) {
                    this.deselectAircraft();

                    return;
                }

                this.$commandInput.val(`${this.input.callsign} `);

                return;
            }
            default:
                this.$commandInput.focus();
        }
    }

    /**
     * @for InputController
     * @method input_history_clamp
     */
    input_history_clamp() {
        this.input.history_item = clamp(0, this.input.history_item, this.input.history.length - 1);
    }

    /**
     * @for InputController
     * @method selectPreviousAircraft
     */
    selectPreviousAircraft() {
        if (this.input.history.length === 0) {
            return;
        }

        if (this.input.history_item == null) {
            this.input.history.unshift(this.input.command);
            this.input.history_item = 0;
        }

        this.input.history_item += 1;
        this.input_history_clamp();

        const callsign = this.input.history[this.input.history_item];
        const aircraftModel = this._aircraftController.findAircraftByCallsign(callsign);

        this.selectAircraft(aircraftModel);
        this.onCommandInputChangeHandler();
    }

    /**
     * @for InputController
     * @method selectNextAircraft
     */
    selectNextAircraft() {
        if (this.input.history.length === 0 || !this.input.history_item) {
            return;
        }

        this.input.history_item -= 1;

        if (this.input.history_item <= 0) {
            this.$commandInput.val(this.input.history[0]);

            this.onCommandInputChangeHandler();

            this.input.history.splice(0, 1);
            this.input.history_item = null;

            return;
        }

        this.input_history_clamp();

        const callsign = this.input.history[this.input.history_item];
        const aircraftModel = this._aircraftController.findAircraftByCallsign(callsign);

        this.selectAircraft(aircraftModel);
        this.onCommandInputChangeHandler();
    }

    /**
     * Encapsulation of repeated boolean logic
     *
     * @for InputController
     * @method _isArrowControlMethod
     * @return {boolean}
     */
    _isArrowControlMethod() {
        return GameController.game.option.getOptionByName(GAME_OPTION_NAMES.CONTROL_METHOD) === 'arrows';
    }

    /**
     * Toggle command bar between aircraft commands and scope commands
     *
     * @for InputController
     * @method _toggleCommandBarContext
     */
    _toggleCommandBarContext() {
        switch (this.commandBarContext) {
            case COMMAND_CONTEXT.AIRCRAFT:
                this.commandBarContext = COMMAND_CONTEXT.SCOPE;
                this.$commandInput.attr('placeholder', 'enter scope command');
                this.$commandInput.css({ color: 'red' });

                return;
            case COMMAND_CONTEXT.SCOPE:
                this.commandBarContext = COMMAND_CONTEXT.AIRCRAFT;
                this.$commandInput.attr('placeholder', 'enter aircraft command');
                this.$commandInput.css({ color: 'white' });

                return;
            default:
                return;
        }
    }

    /**
     * Process user command to be applied to an aircraft
     *
     * @for InputController
     * @method processAircraftCommand
     */
    processAircraftCommand() {
        let aircraftCommandParser;
        // this could use $commandInput.val() as an alternative
        const userCommand = this.input.command.trim().toLowerCase();

        // Using try/catch here very much on purpose. the `AircraftCommandParser` will throw when it encounters any kind
        // of error; invalid length, validation, parse, etc. Here we catch those errors, log them to the screen
        // and then throw them all at once
        try {
            aircraftCommandParser = new AircraftCommandParser(userCommand);
        } catch (error) {
            UiController.ui_log('Command not understood', true);

            throw error;
        }

        if (aircraftCommandParser.command !== PARSED_COMMAND_NAME.TRANSMIT) {
            return this.processSystemCommand(aircraftCommandParser);
        }

        this.input.history.unshift(this.input.callsign);
        this.input.history_item = null;

        return this.processTransmitCommand(aircraftCommandParser);
    }

    /**
     * Process the command currently in the command bar
     *
     * @for InputController
     * @method processCommand
     * @return {array} [success of operation, response]
     */
    processCommand() {
        let response = [];

        if (this.commandBarContext === COMMAND_CONTEXT.AIRCRAFT) {
            response = this.processAircraftCommand();
        } else if (this.commandBarContext === COMMAND_CONTEXT.SCOPE) {
            response = this.processScopeCommand();
        }

        this.deselectAircraft();

        return response;
    }

    /**
     * Process user command to be applied to the user's scope
     *
     * @for InputController
     * @method processScopeCommand
     */
    processScopeCommand() {
        let scopeCommandModel;
        const userCommand = this.input.command.trim().toLowerCase();

        try {
            scopeCommandModel = new ScopeCommandModel(userCommand);
        } catch (error) {
            UiController.ui_log('ERROR: BAD SYNTAX', true);

            throw error;
        }

        const [successful, response] = this._scopeModel.runScopeCommand(scopeCommandModel);
        const isWarning = !successful;

        UiController.ui_log(response, isWarning);
    }

    /**
     * @for InputController
     * @method processSystemCommand
     * @param aircraftCommandParser {AircraftCommandParser}
     * @return {boolean}
     */
    processSystemCommand(aircraftCommandParser) {
        switch (aircraftCommandParser.command) {
            case PARSED_COMMAND_NAME.TUTORIAL:
                this._tutorialView.tutorial_toggle();

                return true;

            case PARSED_COMMAND_NAME.AUTO:
                // TODO: does this function exist anywhere?
                // aircraft_toggle_auto();
                //
                // if (this._aircraftController.aircraft.auto.enabled) {
                //     UiController.ui_log('automatic controller ENGAGED');
                // } else {
                //     UiController.ui_log('automatic controller OFF');
                // }

                return true;

            case PARSED_COMMAND_NAME.PAUSE:
                GameController.game_pause_toggle();

                return true;

            case PARSED_COMMAND_NAME.TIMEWARP:
                let nextTimewarpValue = 0;

                if (aircraftCommandParser.args) {
                    nextTimewarpValue = aircraftCommandParser.args[0];
                }

                GameController.updateTimescale(nextTimewarpValue);

                return true;

            case PARSED_COMMAND_NAME.CLEAR:
                localStorage.clear();
                location.reload();

                break;
            case PARSED_COMMAND_NAME.AIRPORT: {
                // TODO: it may be better to do this in the parser
                const airportIcao = aircraftCommandParser.args[0];

                if (_has(AirportController.airports, airportIcao)) {
                    AirportController.airport_set(airportIcao);
                }

                return true;
            }
            case PARSED_COMMAND_NAME.AIRAC: {
                const airportIcao = AirportController.current.icao.toUpperCase();
                const airacCycle = AirportController.getAiracCycle();

                if (!airacCycle) {
                    UiController.ui_log(`${airportIcao} AIRAC cycle: unknown`);

                    return true;
                }

                UiController.ui_log(`${airportIcao} AIRAC cycle: ${airacCycle}`);

                return true;
            }
            // TODO: this will be removed entirely, eventually.
            case PARSED_COMMAND_NAME.RATE:
                UiController.ui_log('this command has been deprecated', true);

                return true;
            default:
                return true;
        }
    }

    /**
     * @for InputController
     * @method processTransmitCommand
     * @param aircraftCommandParser {AircraftCommandParser}
     * @return {boolean}
     */
    processTransmitCommand(aircraftCommandParser) {
        // TODO: abstract the aircraft callsign matching
        let matches = 0;
        let match = INVALID_NUMBER;

        for (let i = 0; i < this._aircraftController.aircraft.list.length; i++) {
            const aircraft = this._aircraftController.aircraft.list[i];

            if (aircraft.matchCallsign(aircraftCommandParser.callsign)) {
                matches += 1;
                match = i;
            }
        }

        if (matches > 1) {
            UiController.ui_log('multiple aircraft match the callsign, say again', true);

            return true;
        }

        if (match === INVALID_NUMBER) {
            UiController.ui_log('no such aircraft, say again', true);

            return true;
        }

        const aircraft = this._aircraftController.aircraft.list[match];

        return this._aircraftCommander.runCommands(aircraft, aircraftCommandParser.args);
    }

    /**
     * Facade for `_aircraftController.aircraft_get_nearest()`
     *
     * Accepts current mouse position in canvas coordinates x, y
     *
     * @for InputController
     * @method _findClosestAircraftAndDistanceToMousePosition
     * @param x {number}
     * @param y {number}
     * @returns [aircraftModel, number]
     * @private
     */
    _findClosestAircraftAndDistanceToMousePosition(x, y) {
        return this._aircraftController.aircraft_get_nearest([
            CanvasStageModel.translatePixelsToKilometers(x - CanvasStageModel._panX),
            CanvasStageModel.translatePixelsToKilometers(y + CanvasStageModel._panY)
        ]);
    }

    /**
     * Triggered when a user clicks on the `right` mouse button and
     * records the position of the `right click` event.
     *
     * @param event {jquery Event}
     * @private
     */
    _onRightMousePress(event) {
        const mousePositionX = event.pageX - CanvasStageModel._panX;
        const mousePositionY = event.pageY - CanvasStageModel._panY;
        // Record mouse down position for panning
        this._mouseDownScreenPosition = [
            mousePositionX,
            mousePositionY
        ];
        this.input.isMouseDown = true;
    }

    /**
     * Logic that happens when a user clicks on the `left` mouse button
     *
     * TODO: this method is a first step at simplification. there is still
     * more work to do here, but this at least gets us moving in
     * the right direction
     *
     * @for InputController
     * @method _onLeftMouseButtonPress
     * @param event {jquery Event}
     * @private
     */
    _onLeftMouseButtonPress(event) {
        const currentMousePosition = CanvasStageModel.translateMousePositionToCanvasPosition(event.pageX, event.pageY);
        const [aircraftModel, distanceFromPosition] = this._findClosestAircraftAndDistanceToMousePosition(
            currentMousePosition.x,
            currentMousePosition.y
        );

        if (distanceFromPosition > CanvasStageModel.translatePixelsToKilometers(50)) {
            this.deselectAircraft();
        } else if (this.commandBarContext === COMMAND_CONTEXT.SCOPE) {
            const newCommandValue = `${this.$commandInput.val()} ${aircraftModel.callsign}`;
            this.input.command = newCommandValue;
            this.$commandInput.val(newCommandValue);

            this.processCommand();
        } else if (aircraftModel) {
            this.selectAircraft(aircraftModel);
        }
    }
}
