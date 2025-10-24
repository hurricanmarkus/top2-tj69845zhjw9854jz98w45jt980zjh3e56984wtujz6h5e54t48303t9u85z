import { USERS, currentMeal, alertUser } from './haupteingang.js'; // alertUser hinzugefügt, falls noch nicht importiert
import { populatePersonDropdown } from './checklist.js';

let editingPortionId = null; // <-- HIER DEFINIERT (statt in haupteingang.js exportiert)

function setDefaultPortionName() {
    const personId = document.getElementById('person-select').value;
    const nameInput = document.getElementById('portion-name');
    if (!nameInput || !personId) {
        if (nameInput) nameInput.value = ''; // Leeren, wenn keine Person gewählt ist oder Element fehlt
        return;
    };

    const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const today = new Date();

    // Beginne mit dem heutigen Tag
    let nextDayIndex = today.getDay();

    let suggestedName = '';
    // Loop durch maximal 7 Tage, um einen freien Tag zu finden
    for (let i = 0; i < 7; i++) {
        const potentialName = weekdays[nextDayIndex];
        // Prüfen, ob dieser Name für den gewählten User schon existiert
        const nameExists = currentMeal.userInputDistribution.some(
            p => p.personId === personId && p.portionName.toLowerCase() === potentialName.toLowerCase()
        );

        if (!nameExists) {
            suggestedName = potentialName;
            break; // Freien Tag gefunden, Schleife beenden
        }
        // Zum nächsten Tag weitergehen
        nextDayIndex = (nextDayIndex + 1) % 7;
    }

    // Setze den gefundenen Namen oder einen Fallback, falls alle Tage belegt sind
    nameInput.value = suggestedName || weekdays[nextDayIndex]; // Sicherstellen, dass nameInput existiert
}

function setupEssensberechnungListeners() {
    const view = document.getElementById('essensberechnungView');
    if (!view || view.dataset.listenerAttached === 'true') return; // Sicherstellen, dass view existiert

    // ----- Helper-Funktion zum Zurücksetzen des Formulars -----
    const resetPortionForm = () => {
        editingPortionId = null; // Jetzt ist die Variable hier bekannt
        const restBtn = document.getElementById('rest-mode-btn');
        const personSelect = document.getElementById('person-select');
        const portionNameInput = document.getElementById('portion-name');
        const portionAnzahlInput = document.getElementById('portion-anzahl');
        const addBtn = document.getElementById('add-portion-definition-btn');
        const updateBtn = document.getElementById('update-portion-definition-btn');
        const deleteBtn = document.getElementById('delete-portion-definition-btn');
        const formElement = document.getElementById('portion-definition-form');

        if (restBtn && restBtn.classList.contains('bg-indigo-500')) {
            restBtn.classList.remove('bg-indigo-500', 'text-white');
            restBtn.classList.add('bg-gray-200', 'text-gray-800');
            if (personSelect) personSelect.disabled = false;
            if (portionNameInput) portionNameInput.disabled = false;
        }

        if (personSelect) {
            personSelect.value = '';
            const placeholderOption = personSelect.querySelector('option[value=""]');
            if (placeholderOption) placeholderOption.disabled = false;
        }

        if (portionNameInput) portionNameInput.value = '';
        if (portionAnzahlInput) portionAnzahlInput.value = 1;

        document.querySelectorAll('.recipe-portion-weight-input, .product-value-input').forEach(input => {
            input.value = '';
            input.disabled = false;
        });
        document.querySelectorAll('.product-mode-radio[value="gramm"]').forEach(radio => radio.checked = true);

        if (addBtn) addBtn.classList.remove('hidden');
        if (updateBtn) updateBtn.classList.add('hidden');
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (formElement) formElement.classList.remove('bg-yellow-50');

        setDefaultPortionName();
        renderDistributionList();
    };

    view.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;

        const addSingleProductBtn = document.getElementById('add-single-product-btn');
        if (e.target.id === 'single-product-weight' && addSingleProductBtn) {
            e.preventDefault();
            addSingleProductBtn.click();
        }
        if (e.target.classList.contains('ingredient-weight')) {
            e.preventDefault();
            const recipeCard = e.target.closest('.recipe-card');
            if (recipeCard) {
                const addIngredientBtn = recipeCard.querySelector('.add-ingredient-btn');
                if (addIngredientBtn) addIngredientBtn.click();
            }
        }
    });

    const personSelectForEvent = document.getElementById('person-select');
    if (personSelectForEvent) {
        personSelectForEvent.addEventListener('change', setDefaultPortionName);
    }

    // ----- Haupt-Click-Listener -----
    view.addEventListener('click', (e) => {
        // --- Interaktionen im oberen Bereich (Produkte, Rezepte) ---
        if (e.target.closest('#add-single-product-btn')) {
            const nameInput = view.querySelector('#single-product-name');
            const weightInput = view.querySelector('#single-product-weight');
            if (!nameInput || !weightInput) return; // Sicherstellen, dass Elemente existieren
            const name = nameInput.value.trim();
            const weight = parseFloat(weightInput.value);
            if (name && !isNaN(weight) && weight > 0) {
                currentMeal.singleProducts.push({ id: Date.now(), name, weight });
                nameInput.value = '';
                weightInput.value = '';
                renderMealComposition();
                renderDistributionInputs();
                nameInput.focus();
            }
        }
        if (e.target.closest('.delete-recipe-btn')) {
            const recipeId = parseInt(e.target.closest('.delete-recipe-btn').dataset.recipeId);
            if (!isNaN(recipeId) && confirm("Möchten Sie dieses Rezept wirklich löschen?")) {
                currentMeal.recipes = currentMeal.recipes.filter(r => r.id !== recipeId);
                renderMealComposition();
                renderDistributionInputs();
            }
        }
        if (e.target.closest('.delete-single-product-btn')) {
            const productId = parseInt(e.target.closest('.delete-single-product-btn').dataset.id);
            if (!isNaN(productId)) {
                 currentMeal.singleProducts = currentMeal.singleProducts.filter(p => p.id !== productId);
                 renderMealComposition();
                 renderDistributionInputs();
            }
        }
        if (e.target.closest('#add-recipe-btn')) {
            const recipeName = prompt("Wie soll das neue Rezept heißen?");
            if (recipeName && recipeName.trim()) {
                currentMeal.recipes.push({ id: Date.now(), name: recipeName.trim(), ingredients: [], calculatedFinalWeight: 0 });
                renderMealComposition();
                renderDistributionInputs();
            }
        }

        if (e.target.closest('.add-ingredient-btn')) {
            const btn = e.target.closest('.add-ingredient-btn');
            const recipeId = parseInt(btn.dataset.recipeId);
            const recipeCard = view.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
            if (!recipeCard || isNaN(recipeId)) return;
            const nameInput = recipeCard.querySelector('.ingredient-name');
            const weightInput = recipeCard.querySelector('.ingredient-weight');
            if (!nameInput || !weightInput) return;
            const name = nameInput.value.trim();
            const weight = parseFloat(weightInput.value);

            if (name && !isNaN(weight) && weight > 0) {
                const recipe = currentMeal.recipes.find(r => r.id === recipeId);
                if (recipe) {
                    recipe.ingredients.push({ id: Date.now(), name, weight });
                    renderMealComposition(); // Bereich neu zeichnen

                    // Fokus auf das *neue* Eingabefeld setzen
                    const newRecipeCard = view.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
                    if (newRecipeCard) {
                        const newNameInput = newRecipeCard.querySelector('.ingredient-name');
                        if (newNameInput) newNameInput.focus();
                    }
                }
            }
        }
        if (e.target.closest('.delete-ingredient-btn')) {
            const btn = e.target.closest('.delete-ingredient-btn');
            const recipeId = parseInt(btn.dataset.recipeId);
            const ingredientId = parseInt(btn.dataset.ingredientId);
            if (isNaN(recipeId) || isNaN(ingredientId)) return;
            const recipe = currentMeal.recipes.find(r => r.id === recipeId);
            if (recipe) {
                recipe.ingredients = recipe.ingredients.filter(i => i.id !== ingredientId);
                renderMealComposition();
            }
        }

        // --- Logik für den "Rest"-Button ---
        if (e.target.closest('#rest-mode-btn')) {
            const btn = e.target.closest('#rest-mode-btn');
            const personSelect = document.getElementById('person-select');
            const portionNameInput = document.getElementById('portion-name');
            if (!personSelect || !portionNameInput) return;
            const isActivating = !btn.classList.contains('bg-indigo-500');

            if (isActivating) {
                btn.classList.add('bg-indigo-500', 'text-white');
                btn.classList.remove('bg-gray-200', 'text-gray-800');
                personSelect.disabled = true;
                portionNameInput.disabled = true;
                portionNameInput.value = 'Rest';
                personSelect.value = ''; // Leert die Auswahl
            } else {
                btn.classList.remove('bg-indigo-500', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-800');
                personSelect.disabled = false;
                portionNameInput.disabled = false;
                portionNameInput.value = ''; // Leert den Namen
                setDefaultPortionName(); // Versucht, einen Standardnamen zu setzen
            }
        }

        // --- Modus-Umschalter für Produkte ---
        const modeRadio = e.target.closest('.product-mode-radio');
        if (modeRadio) {
            const group = modeRadio.closest('.product-input-group');
            if (group) {
                 const valueInput = group.querySelector('.product-value-input');
                 if (valueInput) {
                     valueInput.disabled = (modeRadio.value !== 'gramm');
                     if (valueInput.disabled) valueInput.value = '';
                 }
            }
        }

        // --- Klick auf eine definierte Portion zum Bearbeiten ODER ABWÄHLEN ---
        const portionItem = e.target.closest('.portion-definition-item');
        if (portionItem && !e.target.closest('#delete-portion-definition-btn')) { // Sicherstellen, dass nicht der Löschen-Knopf geklickt wurde
            const portionId = parseInt(portionItem.dataset.id);
            if (isNaN(portionId)) return;

            if (editingPortionId === portionId) { // Erneut geklickt -> Bearbeitung abbrechen
                resetPortionForm();
                return;
            }

            const portionData = currentMeal.userInputDistribution.find(p => p.id === portionId);
            if (!portionData) return;

            editingPortionId = portionId; // Setzt die ID der zu bearbeitenden Portion

            // UI Elemente holen
            const formElement = document.getElementById('portion-definition-form');
            const addBtn = document.getElementById('add-portion-definition-btn');
            const updateBtn = document.getElementById('update-portion-definition-btn');
            const deleteBtn = document.getElementById('delete-portion-definition-btn');
            const personSelect = document.getElementById('person-select');
            const placeholderOption = personSelect ? personSelect.querySelector('option[value=""]') : null;
            const restBtn = document.getElementById('rest-mode-btn');
            const portionNameInput = document.getElementById('portion-name');
            const portionAnzahlInput = document.getElementById('portion-anzahl');

            // UI Zustand anpassen
            if (formElement) formElement.classList.add('bg-yellow-50');
            if (addBtn) addBtn.classList.add('hidden');
            if (updateBtn) updateBtn.classList.remove('hidden');
            if (deleteBtn) deleteBtn.classList.remove('hidden');

            // Formular füllen
            if (portionData.personId === 'rest_user') {
                if (restBtn && !restBtn.classList.contains('bg-indigo-500')) {
                    restBtn.click(); // Rest-Modus aktivieren, falls nicht aktiv
                }
            } else {
                if (restBtn && restBtn.classList.contains('bg-indigo-500')) {
                    restBtn.click(); // Rest-Modus deaktivieren, falls aktiv
                }
                if (personSelect) personSelect.value = portionData.personId;
                if (placeholderOption) placeholderOption.disabled = true; // Verhindert Auswahl von "Benutzer auswählen..."
            }

            if (portionNameInput) portionNameInput.value = portionData.portionName;
            if (portionAnzahlInput) portionAnzahlInput.value = portionData.anzahl;

            // Rezept- und Produkt-Inputs füllen
            (portionData.recipeInputs || []).forEach(ri => {
                const input = view.querySelector(`.recipe-portion-weight-input[data-recipe-id="${ri.recipeId}"]`);
                if (input) input.value = ri.weight > 0 ? ri.weight : '';
            });
            (portionData.productInputs || []).forEach(pi => {
                const group = view.querySelector(`.product-input-group[data-product-id="${pi.productId}"]`);
                if (group) {
                    const radioToCheck = group.querySelector(`input[name="mode-${pi.productId}"][value="${pi.mode}"]`);
                    if (radioToCheck) radioToCheck.checked = true;
                    const valueInput = group.querySelector('.product-value-input');
                    if (valueInput) {
                        valueInput.value = pi.value > 0 ? pi.value : '';
                        valueInput.disabled = (pi.mode !== 'gramm');
                    }
                }
            });

            renderDistributionList(); // Liste neu zeichnen, um Markierung anzuzeigen
        }

        // --- Klick auf "Änderung übernehmen" ---
        if (e.target.closest('#update-portion-definition-btn')) {
            if (editingPortionId === null) return; // Nur wenn eine Portion bearbeitet wird
            const portionToUpdate = currentMeal.userInputDistribution.find(p => p.id === editingPortionId);
            if (!portionToUpdate) {
                 editingPortionId = null; // Zurücksetzen, falls Portion nicht gefunden wird
                 return;
            }

            const restBtn = document.getElementById('rest-mode-btn');
            const personSelect = document.getElementById('person-select');
            const portionNameInput = document.getElementById('portion-name');
            const portionAnzahlInput = document.getElementById('portion-anzahl');

            if (!restBtn || !personSelect || !portionNameInput || !portionAnzahlInput) return; // Elemente prüfen

            const isRestPortion = restBtn.classList.contains('bg-indigo-500');

            portionToUpdate.personId = isRestPortion ? 'rest_user' : personSelect.value;
            portionToUpdate.personName = isRestPortion ? 'Rest' : (personSelect.options[personSelect.selectedIndex]?.text || 'Unbekannt');
            portionToUpdate.portionName = portionNameInput.value.trim();
            portionToUpdate.anzahl = parseInt(portionAnzahlInput.value) || 1;

            // Rezept- und Produkt-Inputs aktualisieren
            portionToUpdate.recipeInputs = [];
            document.querySelectorAll('.recipe-portion-weight-input').forEach(input => {
                portionToUpdate.recipeInputs.push({ recipeId: parseInt(input.dataset.recipeId), weight: parseFloat(input.value) || 0 });
            });
            portionToUpdate.productInputs = [];
            document.querySelectorAll('.product-input-group').forEach(group => {
                const checkedRadio = group.querySelector('.product-mode-radio:checked');
                portionToUpdate.productInputs.push({
                    productId: parseInt(group.dataset.productId),
                    mode: checkedRadio ? checkedRadio.value : 'gramm', // Fallback auf 'gramm'
                    value: parseFloat(group.querySelector('.product-value-input')?.value) || 0 // Sicherer Zugriff
                });
            });

            resetPortionForm(); // Formular zurücksetzen und Liste neu rendern
        }

        // --- Portion zur Definitions-Liste hinzufügen ---
        if (e.target.closest('#add-portion-definition-btn')) {
            const restBtn = document.getElementById('rest-mode-btn');
            const personSelect = document.getElementById('person-select');
            const portionNameInput = document.getElementById('portion-name');
            const portionAnzahlInput = document.getElementById('portion-anzahl');

            if (!restBtn || !personSelect || !portionNameInput || !portionAnzahlInput) return; // Elemente prüfen

            const isRestPortion = restBtn.classList.contains('bg-indigo-500');
            const personId = isRestPortion ? 'rest_user' : personSelect.value;
            const personName = isRestPortion ? 'Rest' : (personSelect.options[personSelect.selectedIndex]?.text || 'Unbekannt');
            const portionName = portionNameInput.value.trim();
            const anzahl = parseInt(portionAnzahlInput.value) || 1;

            // Validierung
            if ((isRestPortion && currentMeal.userInputDistribution.some(p => p.personId === 'rest_user')) || (!isRestPortion && !personId) || !portionName) {
                if (isRestPortion && currentMeal.userInputDistribution.some(p => p.personId === 'rest_user')) {
                    alertUser("Es kann nur eine 'Rest'-Portion definiert werden.", "error");
                } else {
                    alertUser("Bitte Person und Portionsnamen angeben.", "error");
                }
                return;
            }

            // Rezept-Inputs sammeln
            const recipeInputs = [];
            document.querySelectorAll('.recipe-portion-weight-input').forEach(input => {
                const recipeId = parseInt(input.dataset.recipeId);
                if (!isNaN(recipeId)) {
                     recipeInputs.push({ recipeId: recipeId, weight: parseFloat(input.value) || 0 });
                }
            });

            // Produkt-Inputs sammeln
            const productInputs = [];
            document.querySelectorAll('.product-input-group').forEach(group => {
                const productId = parseInt(group.dataset.productId);
                const checkedRadio = group.querySelector('.product-mode-radio:checked');
                const valueInput = group.querySelector('.product-value-input');
                if (!isNaN(productId) && checkedRadio && valueInput) {
                    productInputs.push({
                        productId: productId,
                        mode: checkedRadio.value,
                        value: parseFloat(valueInput.value) || 0
                    });
                }
            });

            // Neue Portion hinzufügen
            currentMeal.userInputDistribution.push({
                id: Date.now(), portionName, personId, personName, anzahl,
                recipeInputs, productInputs
            });

            resetPortionForm(); // Formular zurücksetzen und Liste neu rendern
        }

        // --- Eine Portions-Definition wieder aus der Liste löschen (im Bearbeitungsmodus) ---
        const deleteDefBtn = e.target.closest('#delete-portion-definition-btn');
        if (deleteDefBtn) {
            if (editingPortionId !== null && confirm("Möchten Sie die ausgewählte Portion wirklich löschen?")) {
                // Filtere die gelöschte Portion aus der Liste
                currentMeal.userInputDistribution = currentMeal.userInputDistribution.filter(p => p.id !== editingPortionId);
                // Setze das Formular zurück
                resetPortionForm();
            }
        }

        // --- Finale Berechnung für alles in der Liste starten ---
        if (e.target.closest('#run-calculation-btn')) {
            calculateAndRenderDistribution();
        }

        // --- Interaktive Buttons im Ergebnisbereich ---
        const viewBtn = e.target.closest('.view-btn');
        if (viewBtn) {
            const mode = viewBtn.dataset.viewMode;
            displayCalculationResult(mode);

            // Button-Hervorhebung aktualisieren
            const switcher = document.getElementById('calculation-view-switcher');
            if (switcher) {
                switcher.querySelectorAll('.view-btn').forEach(btn => {
                    btn.classList.remove('bg-indigo-500', 'text-white');
                    btn.classList.add('bg-gray-300', 'hover:bg-gray-400');
                });
            }
            viewBtn.classList.add('bg-indigo-500', 'text-white');
            viewBtn.classList.remove('bg-gray-300', 'hover:bg-gray-400');
        }
    }); // Ende des Haupt-Click-Listeners

    view.dataset.listenerAttached = 'true';
}

function renderMealComposition() {
    const singleProductsList = document.getElementById('single-products-list');
    const recipesArea = document.getElementById('recipes-area');

    if (singleProductsList) {
        singleProductsList.innerHTML = (currentMeal.singleProducts || []).map(p => `
            <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                <span>${p.name} - <strong>${p.weight}g</strong></span>
                <button data-id="${p.id}" class="delete-single-product-btn p-1 text-red-400 hover:text-red-600">&times;</button>
            </div>
        `).join('');
    }

    if (recipesArea) {
        recipesArea.innerHTML = (currentMeal.recipes || []).map(r => {
            const totalRawWeight = (r.ingredients || []).reduce((sum, i) => sum + (i.weight || 0), 0);
            return `
            <div class="recipe-card p-3 border rounded-lg bg-blue-50" data-recipe-id="${r.id}">
                <div class="flex justify-between items-center">
                    <h4 class="font-semibold text-blue-800">${r.name}</h4>
                    <button data-recipe-id="${r.id}" class="delete-recipe-btn p-1 text-red-500 hover:bg-red-100 rounded-full">&times;</button>
                </div>

                <div class="mt-3 p-2 bg-blue-100 rounded-md">
                    <span class="text-sm font-semibold text-blue-900">Berechnetes Endgewicht (gekocht):</span>
                    <div id="recipe-calculated-weight-${r.id}" class="text-lg font-bold text-blue-900">${r.calculatedFinalWeight ? r.calculatedFinalWeight.toFixed(1) + 'g' : '...'}</div>
                    <div class="text-xs text-blue-700">Rohgewicht der Zutaten: ${totalRawWeight}g</div>
                </div>
                <div class="mt-2 space-y-1 pl-4">
                    ${(r.ingredients || []).map(i => `
                        <div class="flex justify-between items-center text-sm">
                            <span>- ${i.name} (${i.weight}g)</span>
                            <button data-recipe-id="${r.id}" data-ingredient-id="${i.id}" class="delete-ingredient-btn p-1 text-red-400 hover:text-red-600">&times;</button>
                        </div>
                    `).join('')}
                </div>
                <div class="flex gap-2 mt-3 pt-3 border-t">
                    <input type="text" class="ingredient-name flex-grow p-1 border rounded-md text-sm" placeholder="Zutat">
                    <input type="number" class="ingredient-weight w-20 p-1 border rounded-md text-sm" placeholder="g">
                    <button data-recipe-id="${r.id}" class="add-ingredient-btn py-1 px-2 bg-blue-500 text-white text-xs font-bold rounded-md hover:bg-blue-600">+</button>
                </div>
            </div>
        `}).join('');
    }
}

// *** KORRIGIERTE renderDistributionList Funktion ***
function renderDistributionList() {
    const distributionList = document.getElementById('distribution-list');
    if (!distributionList) return; // Sicherstellen, dass das Element existiert

    if (!currentMeal.userInputDistribution || currentMeal.userInputDistribution.length === 0) {
        distributionList.innerHTML = '<p class="text-sm text-center text-gray-400">Noch keine Portionen definiert.</p>';
    } else {
        distributionList.innerHTML = currentMeal.userInputDistribution.map(p => {
            const isEditing = p.id === editingPortionId;
            const itemClasses = isEditing
                ? 'bg-yellow-100 border-yellow-400'
                : 'bg-gray-50 hover:bg-yellow-50'; // Originale Klassen

            // Korrekte Anzeige für "Rest" oder "Portionsname (Personenname)"
            const displayName = p.personId === 'rest_user'
                ? 'Rest'
                : `${p.portionName} (${p.personName})`;

            return `
                <div data-id="${p.id}" class="portion-definition-item flex justify-between items-center p-2 rounded-lg text-sm border cursor-pointer transition-colors ${itemClasses}">
                    <div>
                        <p class="font-bold">${displayName}</p>
                        <p class="text-xs text-gray-600">Anzahl: ${p.anzahl}</p>
                    </div>
                     {/* Hier könnte optional ein kleiner Bearbeiten/Löschen Knopf hin,
                         aber die Hauptlogik ist, auf das Item selbst zu klicken */}
                </div>
            `;
        }).join('');
    }
}


function renderDistributionInputs() {
    const recipeContainer = document.getElementById('recipe-weights-for-person');
    const productContainer = document.getElementById('product-weights-for-person');
    if (!recipeContainer || !productContainer) return;

    // Eingabefelder für Rezepte
    if (currentMeal.recipes && currentMeal.recipes.length > 0) {
        recipeContainer.innerHTML = `<h4 class="text-sm font-semibold text-gray-600 mb-2">Rezept-Gewicht pro Portion (gekocht):</h4>` +
            currentMeal.recipes.map(recipe => `
            <div class="flex items-center gap-2 mb-2">
                <label class="flex-grow text-sm font-medium">${recipe.name}:</label>
                <input type="number" class="recipe-portion-weight-input w-24 p-1 border rounded-md" placeholder="g" data-recipe-id="${recipe.id}">
            </div>
        `).join('');
    } else {
        recipeContainer.innerHTML = ''; // Leeren, wenn keine Rezepte da sind
    }

    // Eingabefelder für Einzelprodukte
    if (currentMeal.singleProducts && currentMeal.singleProducts.length > 0) {
        productContainer.innerHTML = `<h4 class="text-sm font-semibold text-gray-600 mb-2">Gewicht der Einzelprodukte:</h4>` +
            currentMeal.singleProducts.map(product => `
            <div class="p-2 border rounded-md bg-gray-50 product-input-group" data-product-id="${product.id}">
                <label class="font-semibold text-sm text-gray-800">${product.name}:</label>
                <div class="flex items-center gap-2 mt-1">
                    <input type="number" class="product-value-input flex-grow p-1 border rounded-md" placeholder="g">
                    <div class="flex items-center gap-3 text-xs font-medium">
                        <label><input type="radio" name="mode-${product.id}" value="gramm" class="product-mode-radio" checked> g</label>
                        <label><input type="radio" name="mode-${product.id}" value="auto %" class="product-mode-radio"> auto %</label>
                        <label><input type="radio" name="mode-${product.id}" value="auto Port." class="product-mode-radio"> auto Port.</label>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        productContainer.innerHTML = ''; // Leeren, wenn keine Produkte da sind
    }
}

function calculateAndRenderDistribution() {
    currentMeal.finalDistribution = []; // Endergebnis leeren
    const resultsTable = document.getElementById('results-table');
    if (resultsTable) {
         resultsTable.innerHTML = `<p class="text-sm text-gray-500 text-center">Berechnung läuft...</p>`;
    } else {
         console.error("calculateAndRenderDistribution: Ergebnis-Tabelle nicht gefunden!");
         return;
    }


    if (!currentMeal.userInputDistribution || currentMeal.userInputDistribution.length === 0) {
        if (resultsTable) resultsTable.innerHTML = `<p class="text-sm text-gray-500 text-center">Keine Portionen definiert, um die Berechnung zu starten.</p>`;
        renderCalculationViewSwitcher(); // Leere Switcher anzeigen
        return;
    }

    // Schritt 1: Berechne das *gesamte* gekochte Gewicht für jedes Rezept
    (currentMeal.recipes || []).forEach(recipe => {
        const totalCookedWeight = (currentMeal.userInputDistribution || []).reduce((sum, p) => {
            const recipeInput = (p.recipeInputs || []).find(ri => ri.recipeId === recipe.id);
            return sum + ((recipeInput ? (recipeInput.weight || 0) : 0) * (p.anzahl || 0));
        }, 0);
        recipe.calculatedFinalWeight = totalCookedWeight;
    });

    // Schritt 2: Bereite Variablen für die "auto %" und "auto Port." Berechnungen vor
    let totalGrammValueForRatio = (currentMeal.userInputDistribution || []).reduce((sum, p) => {
        const grammSum = (p.productInputs || []).reduce((s, pi) => s + (pi.mode === 'gramm' ? (pi.value || 0) : 0), 0);
        return sum + (grammSum * (p.anzahl || 0));
    }, 0);
    const totalPortionCount = (currentMeal.userInputDistribution || []).reduce((sum, p) => sum + (p.anzahl || 0), 0);

    // Schritt 3: Berechne die *individuellen* finalen Portionen
    (currentMeal.userInputDistribution || []).forEach(portionInput => {
        for (let i = 0; i < (portionInput.anzahl || 0); i++) {
            const finalPortionData = new Map(); // Map für {ZutatName -> Menge}

            // Rezeptanteile hinzufügen
            (portionInput.recipeInputs || []).forEach(ri => {
                const recipe = (currentMeal.recipes || []).find(r => r.id === ri.recipeId);
                if (!recipe || (ri.weight || 0) === 0) return;
                finalPortionData.set(`Rezept: ${recipe.name}`, ri.weight || 0);
            });

            // Einzelproduktanteile berechnen und hinzufügen
            const portionGrammValue = (portionInput.productInputs || []).reduce((s, pi) => s + (pi.mode === 'gramm' ? (pi.value || 0) : 0), 0);
            const portionProductRatio = (totalGrammValueForRatio > 0) ? (portionGrammValue / totalGrammValueForRatio) : (totalPortionCount > 0 ? (1 / totalPortionCount) : 0);

            (portionInput.productInputs || []).forEach(pi => {
                const product = (currentMeal.singleProducts || []).find(p => p.id === pi.productId);
                if (!product) return;
                let amount = 0;
                if (pi.mode === 'gramm') {
                    amount = pi.value || 0;
                } else if (pi.mode === 'auto %') {
                    amount = (product.weight || 0) * portionProductRatio;
                } else if (pi.mode === 'auto Port.') {
                    amount = (totalPortionCount > 0) ? ((product.weight || 0) / totalPortionCount) : 0;
                }

                if (amount > 0.1) { // Nur hinzufügen, wenn Menge relevant ist
                    const currentAmount = finalPortionData.get(product.name) || 0;
                    finalPortionData.set(product.name, currentAmount + amount);
                }
            });

            // Eindeutige ID und Namen für die finale Portion generieren
            const portionId = `${portionInput.id}-${i}`; // Eindeutige ID
            const portionIndexDisplay = (portionInput.anzahl > 1) ? ` ${i + 1}/${portionInput.anzahl}` : '';
            const displayName = portionInput.personId === 'rest_user'
                                ? 'Rest' // Sollte hier eigentlich nicht passieren, da wir Rest separat behandeln
                                : `${portionInput.portionName}${portionIndexDisplay} (${portionInput.personName})`;

            // Nur "echte" Portionen (nicht die Rest-Definition) zum finalen Ergebnis hinzufügen
            if (portionInput.personId !== 'rest_user') {
                currentMeal.finalDistribution.push({ id: portionId, name: displayName, data: finalPortionData });
            }
        }
    });


    // Schritt 4: Berechne den Rest (falls definiert)
    const hasRestDefinition = (currentMeal.userInputDistribution || []).some(p => p.personId === 'rest_user');
    if (hasRestDefinition) {
        const restData = new Map(); // Map für {ZutatName -> RestMenge}

        // 4a: Rest der *gekochten* Rezepte berechnen
        (currentMeal.recipes || []).forEach(recipe => {
            const totalRequiredCooked = currentMeal.finalDistribution.reduce((sum, portion) => {
                 return sum + (portion.data.get(`Rezept: ${recipe.name}`) || 0);
            }, 0);

            const leftoverCooked = (recipe.calculatedFinalWeight || 0) - totalRequiredCooked;
            if (leftoverCooked > 0.1) {
                restData.set(`Rezept: ${recipe.name}`, leftoverCooked);
            }
        });

        // 4b: Rest der *rohen* Zutaten berechnen (aus Einzelprodukten UND Rezept-Zutaten)
        const totalRequiredRaw = new Map();
        currentMeal.finalDistribution.forEach(portion => {
            portion.data.forEach((value, key) => {
                if (key.startsWith('Rezept: ')) { // Wenn es ein Rezeptanteil ist
                    const recipeName = key.replace('Rezept: ', '');
                    const recipe = (currentMeal.recipes || []).find(r => r.name === recipeName);
                    if (recipe && (recipe.calculatedFinalWeight || 0) > 0) {
                        const ratio = value / recipe.calculatedFinalWeight; // Anteil dieser Portion am gekochten Rezept
                        (recipe.ingredients || []).forEach(ing => {
                            const currentRequired = totalRequiredRaw.get(ing.name) || 0;
                            totalRequiredRaw.set(ing.name, currentRequired + ((ing.weight || 0) * ratio));
                        });
                    }
                } else { // Wenn es ein Einzelprodukt oder eine Zutat ist, die direkt hinzugefügt wurde
                    const currentRequired = totalRequiredRaw.get(key) || 0;
                    totalRequiredRaw.set(key, currentRequired + value);
                }
            });
        });

        const totalAvailableRaw = new Map();
        // Verfügbare Einzelprodukte hinzufügen
        (currentMeal.singleProducts || []).forEach(p => {
            const currentAvailable = totalAvailableRaw.get(p.name) || 0;
            totalAvailableRaw.set(p.name, currentAvailable + (p.weight || 0));
        });
        // Verfügbare Zutaten aus allen Rezepten hinzufügen
        (currentMeal.recipes || []).forEach(r => {
            (r.ingredients || []).forEach(ing => {
                const currentAvailable = totalAvailableRaw.get(ing.name) || 0;
                totalAvailableRaw.set(ing.name, currentAvailable + (ing.weight || 0));
            });
        });

        // Rest für jede rohe Zutat berechnen
        totalAvailableRaw.forEach((availableAmount, ingredientName) => {
            const requiredAmount = totalRequiredRaw.get(ingredientName) || 0;
            const leftover = availableAmount - requiredAmount;
            if (leftover > 0.1) { // Nur hinzufügen, wenn Rest relevant ist
                restData.set(ingredientName, leftover);
            }
        });

        // Füge die berechneten Rest-Daten zur finalen Distribution hinzu
        currentMeal.finalDistribution.push({ id: 'rest', name: "Rest", data: restData });
    }

    // Schritt 5: UI aktualisieren
    renderMealComposition(); // Rezeptkarten mit Endgewicht aktualisieren
    renderCalculationViewSwitcher(); // Buttons für Gesamt/Rest/Portionen erstellen
    displayCalculationResult('gesamt'); // Standardmäßig Gesamtergebnis anzeigen
    // Button "Gesamt" hervorheben
    const gesamtBtn = document.querySelector('#calculation-view-switcher .view-btn[data-view-mode="gesamt"]');
    if (gesamtBtn) {
        const switcher = document.getElementById('calculation-view-switcher');
         if (switcher) {
            switcher.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.remove('bg-indigo-500', 'text-white');
                btn.classList.add('bg-gray-300', 'hover:bg-gray-400');
            });
         }
        gesamtBtn.classList.add('bg-indigo-500', 'text-white');
        gesamtBtn.classList.remove('bg-gray-300', 'hover:bg-gray-400');
    }

    if (resultsTable) resultsTable.innerHTML = `<p class="text-sm text-gray-500 text-center">Berechnung abgeschlossen. Bitte Ansicht auswählen.</p>`;
}

function renderCalculationViewSwitcher() {
    const switcher = document.getElementById('calculation-view-switcher');
    if (!switcher) return;

    // Prüfen, ob eine "Rest"-Portion im finalen Ergebnis existiert
    const hasRestPortion = (currentMeal.finalDistribution || []).some(p => p.id === 'rest');

    let switcherHTML = `
        <button class="view-btn p-2 text-sm font-semibold rounded-md bg-gray-300 hover:bg-gray-400" data-view-mode="gesamt">Gesamt</button>
    `;

    // Nur wenn eine Rest-Portion da ist, den Button hinzufügen
    if (hasRestPortion) {
        switcherHTML += `<button class="view-btn p-2 text-sm font-semibold rounded-md bg-gray-300 hover:bg-gray-400" data-view-mode="rest">Rest</button>`;
    }

    // Buttons für jede *echte* Portion hinzufügen (nicht für "Rest")
    (currentMeal.finalDistribution || []).forEach(portion => {
        if (portion.id !== 'rest') {
            switcherHTML += `<button class="view-btn p-2 text-sm font-semibold rounded-md bg-gray-300 hover:bg-gray-400" data-view-mode="${portion.id}">${portion.name}</button>`;
        }
    });

    switcher.innerHTML = switcherHTML;
}

function displayCalculationResult(mode) {
    const resultsTable = document.getElementById('results-table');
    if (!resultsTable) return;

    let dataToShow = new Map(); // {Name -> Menge}
    let header = 'Unbekannt';

    if (mode === 'gesamt') {
        header = 'Gesamtübersicht (Rohzutaten & Gekochte Rezepte)';
        // Alle rohen Einzelprodukte hinzufügen
        (currentMeal.singleProducts || []).forEach(p => {
            dataToShow.set(p.name, (dataToShow.get(p.name) || 0) + (p.weight || 0));
        });
        // Alle rohen Zutaten aus *allen* Rezepten hinzufügen
        (currentMeal.recipes || []).forEach(r => {
            (r.ingredients || []).forEach(ing => {
                dataToShow.set(ing.name, (dataToShow.get(ing.name) || 0) + (ing.weight || 0));
            });
             // Das *gesamte* berechnete gekochte Gewicht des Rezepts hinzufügen
            if ((r.calculatedFinalWeight || 0) > 0.1) {
                 dataToShow.set(`Rezept: ${r.name}`, r.calculatedFinalWeight);
            }
        });

    } else { // Einzelne Portion oder Rest
        const portionId = (mode === 'rest') ? 'rest' : mode; // Mode ist die ID
        const targetPortion = (currentMeal.finalDistribution || []).find(p => p.id === portionId);

        if (targetPortion) {
            header = targetPortion.name;
            // Kopiere die Daten der spezifischen Portion (gekochte Rezeptanteile & rohe Einzelproduktanteile)
            dataToShow = new Map(targetPortion.data);

            // Wenn es eine *echte* Portion ist (nicht der Rest), füge die anteiligen *rohen* Rezeptzutaten hinzu
            if (mode !== 'rest') {
                (currentMeal.recipes || []).forEach(recipe => {
                    const recipeKey = `Rezept: ${recipe.name}`;
                    if (dataToShow.has(recipeKey)) {
                        const portionCookedWeight = dataToShow.get(recipeKey);
                        if ((recipe.calculatedFinalWeight || 0) > 0) {
                            const ratio = portionCookedWeight / recipe.calculatedFinalWeight;
                            (recipe.ingredients || []).forEach(ing => {
                                const rawAmount = (ing.weight || 0) * ratio;
                                if (rawAmount > 0.1) {
                                     dataToShow.set(ing.name, (dataToShow.get(ing.name) || 0) + rawAmount);
                                }
                            });
                        }
                    }
                });
            }
        } else {
             header = `Portion "${mode}" nicht gefunden`;
        }
    }

    // Tabelle generieren
    let tableHTML = `<div class="overflow-x-auto"><table class="min-w-full bg-white border rounded-lg text-sm">
        <thead class="bg-gray-100"><tr>
            <th class="p-2 border-b text-left">Zutat / Rezept</th>
            <th class="p-2 border-b text-right">${header}</th>
        </tr></thead><tbody>`;

    const renderedKeys = new Set(); // Um doppelte Einträge (Zutat vs. Rezept) zu vermeiden

    // 1. Gekochte Rezeptanteile (falls vorhanden) rendern
    (currentMeal.recipes || []).forEach(recipe => {
        const recipeKey = `Rezept: ${recipe.name}`;
        const recipeCookedWeight = dataToShow.get(recipeKey) || 0;

        if (recipeCookedWeight > 0.1) {
            tableHTML += `<tr class="bg-blue-50 font-semibold hover:bg-blue-100">
                <td class="p-2 border-b">${recipe.name}</td>
                <td class="p-2 border-b text-right">${recipeCookedWeight.toFixed(1)}g</td>
            </tr>`;
            renderedKeys.add(recipeKey); // Markiere das gekochte Rezept als gerendert

            // Zugehörige Rohzutaten rendern (nur wenn NICHT Gesamtansicht)
             if (mode !== 'gesamt') {
                (recipe.ingredients || []).forEach(ingredient => {
                    const ingredientWeight = dataToShow.get(ingredient.name) || 0;
                     // Zeige nur, wenn die Zutat auch *berechnet* wurde (Anteil > 0)
                     // UND sie noch nicht als eigenständige Zeile gerendert wurde
                    if (ingredientWeight > 0.1 && !renderedKeys.has(ingredient.name)) {
                        tableHTML += `<tr class="hover:bg-gray-50">
                            <td class="p-2 border-b pl-6 text-gray-600">${ingredient.name}</td>
                            <td class="p-2 border-b text-right text-gray-600">${ingredientWeight.toFixed(1)}g</td>
                        </tr>`;
                        renderedKeys.add(ingredient.name); // Markiere die Zutat als gerendert
                    }
                });
            }
        }
    });

    // 2. Alle *restlichen* Einträge rendern (Einzelprodukte oder Rohzutaten, die noch nicht unter einem Rezept gelistet wurden)
    for (const [key, value] of dataToShow.entries()) {
        // Nur rendern, wenn der Schlüssel noch nicht verarbeitet wurde UND die Menge relevant ist
        if (!renderedKeys.has(key) && value > 0.1) {
            tableHTML += `<tr class="hover:bg-gray-50">
                <td class="p-2 border-b font-semibold">${key}</td>
                <td class="p-2 border-b text-right">${value.toFixed(1)}g</td>
            </tr>`;
             renderedKeys.add(key); // Markiere auch diese als gerendert
        }
    }


    tableHTML += `</tbody></table></div>`;

     if (dataToShow.size === 0) {
          resultsTable.innerHTML = `<p class="text-sm text-gray-500 text-center">Keine Daten für die Ansicht "${header}" verfügbar.</p>`;
     } else {
         resultsTable.innerHTML = tableHTML;
     }
}


export function initializeEssensberechnungView() {
    setupEssensberechnungListeners(); // Stellt sicher, dass die Listener nur einmal gesetzt werden
    populatePersonDropdown();         // Füllt das Dropdown-Menü

    // UI Elemente initial rendern
    renderMealComposition();
    renderDistributionInputs();
    renderDistributionList(); // Zeigt die Liste der bereits definierten Portionen an
    renderCalculationViewSwitcher(); // Zeigt die Buttons (initial nur "Gesamt")
    displayCalculationResult('gesamt'); // Zeigt initial die Gesamtübersicht (leer)

    // Setzt den Standard-Portionsnamen (z.B. "Mittwoch"), falls das Input-Feld existiert
    setDefaultPortionName();
}