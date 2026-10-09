// Pas de console en plus de la fenêtre sous Windows en version publiée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mixlab_lib::run()
}
